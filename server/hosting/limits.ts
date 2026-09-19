export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_FILES = 80;
export const MAX_BATCH_UPLOADS = 20;

export const TTL_OPTIONS = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  keep: null,
} as const;

export type TtlOption = keyof typeof TTL_OPTIONS;

// 自分用アーカイブが主用途なので、ttl 未指定は期限なし（keep）にする
export const DEFAULT_TTL: TtlOption = "keep";

export const ALLOWED_UPLOAD_EXT = new Set(["html", "htm", "zip"]);

// ZIP 内に許可する静的アセット拡張子（実行ファイルなどは入れない）
export const ALLOWED_ASSET_EXT = new Set([
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "json",
  "map",
  "txt",
  "md",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "webmanifest",
  "xml",
]);

export function expiresAtFromTtl(ttl: TtlOption, now = Date.now()): number | null {
  const ms = TTL_OPTIONS[ttl];
  return ms === null ? null : now + ms;
}

export function extensionOf(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}
