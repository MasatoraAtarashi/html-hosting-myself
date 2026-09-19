import { describe, expect, it } from "vitest";
import { buildArchiveChrome, escapeHtml, isHtmlContentType } from "../server/hosting/chrome";

describe("archive chrome builder", () => {
  it("タイトルの HTML をエスケープする", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)"> & '`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;",
    );
  });

  it("text/html だけ書庫バー対象にする", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("text/css; charset=utf-8")).toBe(false);
    expect(isHtmlContentType("image/png")).toBe(false);
    expect(isHtmlContentType(null)).toBe(false);
  });

  it("一覧へ・前後・ジャンプのリンクを出す", () => {
    const html = buildArchiveChrome({
      currentSlug: "bbbbbbbb",
      currentTitle: `Research <script>alert(1)</script>`,
      currentPagePath: "index.html",
      hosts: [
        { slug: "aaaaaaaa", title: "新しい" },
        { slug: "bbbbbbbb", title: `Research <script>alert(1)</script>` },
        { slug: "cccccccc", title: '古い "item"' },
      ],
    });
    expect(html).toContain('id="hh-lib-home"');
    expect(html).toContain('href="/"');
    expect(html).toContain("一覧へ");
    expect(html).toContain('href="/p/aaaaaaaa/"');
    expect(html).toContain("前へ");
    expect(html).toContain('href="/p/cccccccc/"');
    expect(html).toContain("次へ");
    expect(html).toContain("ジャンプ");
    expect(html).toContain('id="hh-lib-notes"');
    expect(html).toContain("メモ");
    expect(html).toContain('data-slug="bbbbbbbb"');
    expect(html).toContain('data-page-path="index.html"');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;item&quot;");
  });

  it("端の資料では前へ / 次へを無効化する", () => {
    const newest = buildArchiveChrome({
      currentSlug: "newnew12",
      currentTitle: "新",
      currentPagePath: "index.html",
      hosts: [
        { slug: "newnew12", title: "新" },
        { slug: "oldold12", title: "旧" },
      ],
    });
    expect(newest).toContain('aria-disabled="true">前へ');
    expect(newest).toContain('href="/p/oldold12/"');
    expect(newest).not.toMatch(/href="\/p\/newnew12\/">前へ/);

    const oldest = buildArchiveChrome({
      currentSlug: "oldold12",
      currentTitle: "旧",
      currentPagePath: "index.html",
      hosts: [
        { slug: "newnew12", title: "新" },
        { slug: "oldold12", title: "旧" },
      ],
    });
    expect(oldest).toContain('href="/p/newnew12/"');
    expect(oldest).toContain('aria-disabled="true">次へ');
  });
});
