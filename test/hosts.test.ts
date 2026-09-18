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
    const pageHtml = await page.text();
    expect(pageHtml).toContain("公開ページ");
    expect(pageHtml).toContain("一覧へ");
    expect(pageHtml).toContain('href="/"');
    expect(pageHtml).toContain('id="hh-lib-chrome"');
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
    const htmlText = await html.text();
    expect(htmlText).toContain("zip ok");
    expect(htmlText).toContain("一覧へ");

    const css = await exports.default.fetch(`https://example.com/p/${item.slug}/css/app.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/text\/css/);
    const cssText = await css.text();
    expect(cssText).toContain("color:#c00");
    expect(cssText).not.toContain("一覧へ");
    expect(cssText).not.toContain("hh-lib-chrome");
  });

  it("ZIP 内のネストした HTML にも書庫バーを付ける", async () => {
    const zipped = zipSync({
      "site/index.html": strToU8("<!doctype html><html><body><p>home</p></body></html>"),
      "site/notes/a.html": strToU8("<!doctype html><html><body><p>nested page</p></body></html>"),
    });
    const file = new File([zipped], "site.zip", { type: "application/zip" });
    const created = await upload(file);
    const { item } = (await created.json()) as { item: { slug: string } };

    const nested = await exports.default.fetch(`https://example.com/p/${item.slug}/notes/a.html`);
    expect(nested.status).toBe(200);
    const text = await nested.text();
    expect(text).toContain("nested page");
    expect(text).toContain("一覧へ");
    expect(text).toContain('href="/"');
  });

  it("複数ホストでは前へ / 次へが一覧順（新しい→古い）になる", async () => {
    const olderFile = new File(
      ["<!doctype html><html><body><p>old</p></body></html>"],
      "old.html",
      {
        type: "text/html",
      },
    );
    const newerFile = new File(
      ["<!doctype html><html><body><p>new</p></body></html>"],
      "new.html",
      {
        type: "text/html",
      },
    );
    const olderCreated = await upload(olderFile);
    const newerCreated = await upload(newerFile);
    const older = (await olderCreated.json()) as { item: { slug: string } };
    const newer = (await newerCreated.json()) as { item: { slug: string } };

    await env.DB.prepare("UPDATE hosts SET created_at = ? WHERE slug = ?")
      .bind(1_000, older.item.slug)
      .run();
    await env.DB.prepare("UPDATE hosts SET created_at = ? WHERE slug = ?")
      .bind(2_000, newer.item.slug)
      .run();

    const newerPage = await exports.default.fetch(`https://example.com/p/${newer.item.slug}/`);
    const newerHtml = await newerPage.text();
    expect(newerHtml).toContain(`href="/p/${older.item.slug}/"`);
    expect(newerHtml).toContain("次へ");
    expect(newerHtml).toContain('aria-disabled="true">前へ');

    const olderPage = await exports.default.fetch(`https://example.com/p/${older.item.slug}/`);
    const olderHtml = await olderPage.text();
    expect(olderHtml).toContain(`href="/p/${newer.item.slug}/"`);
    expect(olderHtml).toContain("前へ");
    expect(olderHtml).toContain('aria-disabled="true">次へ');
  });

  it("閲覧ページのタイトルは書庫バーでもエスケープされる", async () => {
    const html =
      '<!doctype html><html><head><title>x & y "z"</title></head><body><p>safe</p></body></html>';
    const file = new File([html], "safe.html", { type: "text/html" });
    const created = await upload(file);
    const { item } = (await created.json()) as { item: { slug: string; title: string } };
    expect(item.title).toBe(`x & y "z"`);

    const page = await exports.default.fetch(`https://example.com/p/${item.slug}/`);
    const body = await page.text();
    expect(body).toContain("x &amp; y &quot;z&quot;");
    expect(body).not.toContain(`title="x & y "z""`);
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
