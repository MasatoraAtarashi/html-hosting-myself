import type { Context } from "hono";
import type { AppEnv } from "../env";
import { deleteHostObjects } from "./cleanup";
import { applyArchiveChrome, isHtmlContentType, loadArchiveNav } from "./chrome";
import { contentTypeFor } from "./mime";
import { isValidSlug } from "./slug";

function objectKey(slug: string, relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed.length === 0) return `${slug}/index.html`;
  return `${slug}/${trimmed}`;
}

export async function serveHost(c: Context<AppEnv>): Promise<Response> {
  const url = new URL(c.req.url);
  const match = url.pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!match) {
    return c.text("Not Found", 404);
  }

  const slug = match[1];
  if (!isValidSlug(slug)) {
    return c.text("Not Found", 404);
  }

  const rest = match[2] ?? "";
  // HTML 内の相対パスが解決できるよう、ルートは末尾スラッシュへ揃える
  if (rest === "") {
    return c.redirect(`/p/${slug}/`, 302);
  }

  const host = await c.env.DB.prepare("SELECT slug, title, expires_at FROM hosts WHERE slug = ?")
    .bind(slug)
    .first<{ slug: string; title: string; expires_at: number | null }>();

  if (!host) {
    return c.text("Not Found", 404);
  }

  if (host.expires_at !== null && host.expires_at < Date.now()) {
    c.executionCtx.waitUntil(
      (async () => {
        await deleteHostObjects(c.env.BUCKET, slug);
        await c.env.DB.prepare("DELETE FROM hosts WHERE slug = ?").bind(slug).run();
      })(),
    );
    return c.text("このホストは期限切れです", 410, { "content-type": "text/plain; charset=utf-8" });
  }

  let relative = decodeURIComponent(rest);
  if (relative.startsWith("/")) relative = relative.slice(1);
  if (relative.includes("..")) {
    return c.text("Not Found", 404);
  }
  if (relative === "" || relative.endsWith("/")) {
    relative = `${relative}index.html`.replace(/^\/+/, "");
  }

  const object = await c.env.BUCKET.get(objectKey(slug, relative));
  if (!object) {
    return c.text("Not Found", 404);
  }

  const contentType = contentTypeFor(relative);
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set(
    "cache-control",
    isHtmlContentType(contentType) ? "private, max-age=60" : "public, max-age=300",
  );
  headers.set("x-content-type-options", "nosniff");
  const requestId = c.get("requestId");
  if (requestId) headers.set("x-request-id", requestId);

  const response = new Response(object.body, { status: 200, headers });
  if (!isHtmlContentType(contentType)) {
    return response;
  }

  // HTML だけ書庫バーを注入する。CSS/画像はそのまま返し、ZIP 配下の HTML にも同じバーが付く。
  const hosts = await loadArchiveNav(c.env.DB);
  return applyArchiveChrome(response, {
    currentSlug: slug,
    currentTitle: host.title,
    hosts,
  });
}
