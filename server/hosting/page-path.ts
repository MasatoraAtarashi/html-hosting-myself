const MAX_PAGE_PATH = 512;

/** ZIP 配下も含め、ホスト内の HTML パスを R2 キーと同じ形に揃える */
export function normalizePagePath(raw: string | undefined, fallback = "index.html"): string | null {
  let path = (raw ?? fallback).trim();
  if (path.length === 0) path = fallback;
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, "");
  if (path.includes("\0") || path.includes("\\") || path.split("/").includes("..")) {
    return null;
  }
  if (path.length > MAX_PAGE_PATH) return null;
  if (path === "" || path.endsWith("/")) {
    path = `${path}index.html`.replace(/^\/+/, "");
  }
  return path;
}
