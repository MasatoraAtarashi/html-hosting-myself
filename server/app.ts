import { Hono, type Context } from "hono";
import { requestId } from "./middleware/request-id";
import { api } from "./api";
import { serveHost } from "./hosting/serve";
import type { AppEnv } from "./env";

function servePublicAsset(pathname: string) {
  return async (c: Context<AppEnv>) => {
    const url = new URL(c.req.url);
    url.pathname = pathname;
    const asset = await c.env.ASSETS.fetch(url.toString());
    // ASSETS の Response ヘッダは immutable なので、request-id を付けられるようコピーする
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers: new Headers(asset.headers),
    });
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestId);
  // 本番は Static Assets が先に返す。テストの Worker fetch はこのルート経由で ASSETS を読む
  app.get("/favicon.ico", servePublicAsset("/favicon.ico"));
  app.get("/favicon.png", servePublicAsset("/favicon.png"));
  app.get("/apple-touch-icon.png", servePublicAsset("/apple-touch-icon.png"));
  app.route("/api", api);
  // /p/:slug と /p/:slug/… を同じハンドラで処理する（相対パスの解決のため末尾スラッシュへリダイレクト）
  app.get("/p/:slug", serveHost);
  app.get("/p/:slug/", serveHost);
  app.get("/p/:slug/*", serveHost);
  return app;
}
