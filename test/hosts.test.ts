import { zipSync, strToU8 } from "fflate";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const accessHeaders = {
  "cf-access-authenticated-user-email": "test@example.com",
};

async function upload(file: File, ttl?: string, headers: HeadersInit = accessHeaders) {
  const form = new FormData();
  form.set("file", file);
  if (ttl) form.set("ttl", ttl);
  return exports.default.fetch("https://example.com/api/upload", {
    method: "POST",
    headers,
    body: form,
  });
}

describe("hosting API", () => {
  it("HTML をアップロードすると短い URL で text/html として描画される", async () => {
    const html =
      "<!doctype html><html><head><title>Hello Host</title></head><body><h1>公開ページ</h1></body></html>";
    const file = new File([html], "hello.html", { type: "text/html" });
    const created = await upload(file);
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      item: { slug: string; title: string; url: string };
    };
    expect(body.item.title).toBe("Hello Host");
    expect(body.item.url).toBe(`/p/${body.item.slug}/`);

    const page = await exports.default.fetch(`https://example.com/p/${body.item.slug}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("公開ページ");
  });

  it("共有 URL は認証なしで HTML を返す", async () => {
    const file = new File(["<!doctype html><title>open</title><p>public</p>"], "open.html", {
      type: "text/html",
    });
    const created = await upload(file);
    const { item } = (await created.json()) as { item: { slug: string } };

    const page = await exports.default.fetch(`https://example.com/p/${item.slug}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("public");
  });

  it("ZIP の入れ子アセットを同じスラッグ配下で配信する", async () => {
    const zipped = zipSync({
      "site/index.html": strToU8(
        '<!doctype html><html><head><link rel="stylesheet" href="css/app.css"></head><body><p>zip ok</p></body></html>',
      ),
      "site/css/app.css": strToU8("body{color:#c00}"),
    });
    const file = new File([zipped], "site.zip", { type: "application/zip" });
    const created = await upload(file);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { slug: string } };

    const html = await exports.default.fetch(`https://example.com/p/${item.slug}/`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("zip ok");

    const css = await exports.default.fetch(`https://example.com/p/${item.slug}/css/app.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/text\/css/);
    expect(await css.text()).toContain("color:#c00");
  });

  it("期限切れのホストは 410 になり、掃除で削除される", async () => {
    const file = new File(["<!doctype html><title>soon</title><p>x</p>"], "soon.html", {
      type: "text/html",
    });
    const created = await upload(file, "1d");
    const { item } = (await created.json()) as { item: { slug: string } };

    await env.DB.prepare("UPDATE hosts SET expires_at = ? WHERE slug = ?")
      .bind(Date.now() - 1000, item.slug)
      .run();

    const gone = await exports.default.fetch(`https://example.com/p/${item.slug}/`);
    expect(gone.status).toBe(410);

    const { purgeExpiredHosts } = await import("../server/hosting/cleanup");
    await purgeExpiredHosts(env);

    const list = await exports.default.fetch("https://example.com/api/hosts", {
      headers: accessHeaders,
    });
    const listed = (await list.json()) as { items: { slug: string }[] };
    expect(listed.items.some((row) => row.slug === item.slug)).toBe(false);
  });

  it("DELETE すると一覧と共有 URL から消える", async () => {
    const file = new File(["<!doctype html><p>del</p>"], "del.html", { type: "text/html" });
    const created = await upload(file);
    const { item } = (await created.json()) as { item: { slug: string } };

    const del = await exports.default.fetch(`https://example.com/api/hosts/${item.slug}`, {
      method: "DELETE",
      headers: accessHeaders,
    });
    expect(del.status).toBe(204);

    const again = await exports.default.fetch(`https://example.com/api/hosts/${item.slug}`, {
      method: "DELETE",
      headers: accessHeaders,
    });
    expect(again.status).toBe(404);

    const page = await exports.default.fetch(`https://example.com/p/${item.slug}/`);
    expect(page.status).toBe(404);
  });

  it("ttl を省略すると expiresAt は null（期限なし）になる", async () => {
    const file = new File(["<!doctype html><p>archive</p>"], "archive.html", { type: "text/html" });
    const created = await upload(file);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { expiresAt: number | null } };
    expect(item.expiresAt).toBeNull();
  });

  it("keep にすると expires_at が null になる", async () => {
    const file = new File(["<!doctype html><p>keep</p>"], "keep.html", { type: "text/html" });
    const created = await upload(file, "7d");
    const { item } = (await created.json()) as { item: { slug: string; expiresAt: number | null } };
    expect(item.expiresAt).not.toBeNull();

    const patched = await exports.default.fetch(`https://example.com/api/hosts/${item.slug}`, {
      method: "PATCH",
      headers: { ...accessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ ttl: "keep" }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { item: { expiresAt: number | null } };
    expect(body.item.expiresAt).toBeNull();
  });

  it("不正な ttl は 400", async () => {
    const file = new File(["<!doctype html><p>x</p>"], "x.html", { type: "text/html" });
    expect((await upload(file, "forever")).status).toBe(400);
  });

  it("file が無い・非対応形式は 400", async () => {
    const empty = await exports.default.fetch("https://example.com/api/upload", {
      method: "POST",
      headers: accessHeaders,
      body: new FormData(),
    });
    expect(empty.status).toBe(400);

    const txt = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect((await upload(txt)).status).toBe(400);
  });
});
