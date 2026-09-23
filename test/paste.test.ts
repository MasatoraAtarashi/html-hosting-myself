import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "../server/hosting/limits";
import { isFullHtmlDocument, preparePastedHtml } from "../server/hosting/paste-html";

const accessHeaders = {
  "cf-access-authenticated-user-email": "test@example.com",
};

function paste(
  html: string,
  fields: Record<string, string> = {},
  headers: HeadersInit = accessHeaders,
) {
  const form = new FormData();
  form.set("html", html);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return exports.default.fetch("https://example.com/api/upload", {
    method: "POST",
    headers,
    body: form,
  });
}

describe("preparePastedHtml", () => {
  it("空と空白は拒否する", () => {
    expect(preparePastedHtml("", null)).toEqual({ ok: false, error: "HTML が空です" });
    expect(preparePastedHtml("  \n\t", "  ")).toEqual({ ok: false, error: "HTML が空です" });
  });

  it("断片は最小の文書に包み、header 要素は文書扱いにしない", () => {
    expect(isFullHtmlDocument("<header><h1>x</h1></header>")).toBe(false);
    expect(isFullHtmlDocument("<!DOCTYPE html><html><body></body></html>")).toBe(true);
    expect(isFullHtmlDocument("<head><title>t</title></head>")).toBe(true);

    const prepared = preparePastedHtml("<h1>断片</h1>", null);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const text = new TextDecoder().decode(prepared.bytes);
    expect(text).toMatch(/<!doctype html>/i);
    expect(text).toContain('charset="utf-8"');
    expect(text).toContain("width=device-width");
    expect(text).toContain("<h1>断片</h1>");
    expect(text).toContain("<title>貼り付け HTML</title>");
    expect(prepared.title).toBe("貼り付け HTML");
  });

  it("完全な HTML は包まず、指定タイトルは書庫名だけに使う", () => {
    const html =
      "<!doctype html><html><head><title>Doc</title></head><body><p>keep</p></body></html>";
    const prepared = preparePastedHtml(html, "  メモ  ");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(new TextDecoder().decode(prepared.bytes)).toBe(html);
    expect(prepared.title).toBe("メモ");
  });

  it("タイトルの制御文字を除き、表示用にエスケープする", () => {
    const prepared = preparePastedHtml("<p>x</p>", "A & B <C>\n");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.title).toBe("A & B <C>");
    const text = new TextDecoder().decode(prepared.bytes);
    expect(text).toContain("<title>A &amp; B &lt;C&gt;</title>");
    expect(text).not.toContain("<title>A & B <C>");
  });

  it("10MB を超える HTML は拒否する", () => {
    const over = preparePastedHtml(`<p>${"a".repeat(MAX_UPLOAD_BYTES)}</p>`, null);
    expect(over).toEqual({ ok: false, error: "HTML の上限は 10MB です" });

    const wrappedOver = preparePastedHtml("a".repeat(MAX_UPLOAD_BYTES - 20), null);
    expect(wrappedOver.ok).toBe(false);
  });
});

describe("HTML 貼り付け API", () => {
  it("完全な HTML を保存すると書庫バー付きで表示され、メモも残せる", async () => {
    const html =
      "<!doctype html><html><head><title>Hello Paste</title></head><body><p>貼り付け本文</p></body></html>";
    const created = await paste(html);
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      item: { slug: string; title: string; url: string; expiresAt: number | null };
    };
    expect(body.item.title).toBe("Hello Paste");
    expect(body.item.url).toBe(`/p/${body.item.slug}/`);
    expect(body.item.expiresAt).toBeNull();

    const page = await exports.default.fetch(`https://example.com/p/${body.item.slug}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    const pageHtml = await page.text();
    expect(pageHtml).toContain("貼り付け本文");
    expect(pageHtml.match(/<!doctype/gi)).toHaveLength(1);
    expect(pageHtml).toContain("一覧へ");
    expect(pageHtml).toContain('id="hh-lib-chrome"');
    expect(pageHtml).toContain('src="/hh-lib-annotate.js"');

    const listed = await exports.default.fetch("https://example.com/api/hosts", {
      headers: accessHeaders,
    });
    const items = (await listed.json()) as { items: { slug: string; title: string }[] };
    expect(
      items.items.some((item) => item.slug === body.item.slug && item.title === "Hello Paste"),
    ).toBe(true);

    const note = await exports.default.fetch(
      `https://example.com/api/hosts/${body.item.slug}/annotations`,
      {
        method: "POST",
        headers: { ...accessHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          pagePath: "index.html",
          quote: { exact: "貼り付け本文", prefix: "", suffix: "" },
          body: "貼り付けページのメモ",
        }),
      },
    );
    expect(note.status).toBe(201);
  });

  it("断片を保存すると包んだページとして開ける", async () => {
    const created = await paste("<section><h1>スニペット</h1><p>fragment body</p></section>", {
      title: "チャット断片",
    });
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { slug: string; title: string } };
    expect(item.title).toBe("チャット断片");

    const pageHtml = await (
      await exports.default.fetch(`https://example.com/p/${item.slug}/`)
    ).text();
    expect(pageHtml).toContain("fragment body");
    expect(pageHtml).toContain("<title>チャット断片</title>");
    expect(pageHtml).toContain('charset="utf-8"');
    expect(pageHtml.match(/<!doctype/gi)).toHaveLength(1);
    expect(pageHtml).toContain("一覧へ");
    expect(pageHtml).toContain('id="hh-lib-notes"');
  });

  it("空・同時指定・不正な ttl・未認証は拒否する", async () => {
    const empty = await paste("  \n");
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe("HTML が空です");

    const both = new FormData();
    both.set("html", "<p>x</p>");
    both.set("file", new File(["<!doctype html><p>f</p>"], "f.html", { type: "text/html" }));
    const conflict = await exports.default.fetch("https://example.com/api/upload", {
      method: "POST",
      headers: accessHeaders,
      body: both,
    });
    expect(conflict.status).toBe(400);
    expect(((await conflict.json()) as { error: string }).error).toContain("同時に指定できません");

    const badTtl = await paste("<p>x</p>", { ttl: "forever" });
    expect(badTtl.status).toBe(400);

    const over = await paste(`<p>${"a".repeat(MAX_UPLOAD_BYTES)}</p>`);
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toBe("HTML の上限は 10MB です");

    const anon = await paste("<p>secret</p>", {}, {});
    expect(anon.status).toBe(401);

    const hosts = await env.DB.prepare("SELECT COUNT(*) AS n FROM hosts").first<{ n: number }>();
    expect(hosts?.n).toBe(0);
  });
});
