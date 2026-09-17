import { Hono } from "hono";
import { requestId } from "./middleware/request-id";
import { api } from "./api";
import { serveHost } from "./hosting/serve";
import type { AppEnv } from "./env";

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestId);
  app.route("/api", api);
  // /p/:slug と /p/:slug/… を同じハンドラで処理する（相対パスの解決のため末尾スラッシュへリダイレクト）
  app.get("/p/:slug", serveHost);
  app.get("/p/:slug/", serveHost);
  app.get("/p/:slug/*", serveHost);
  return app;
}
