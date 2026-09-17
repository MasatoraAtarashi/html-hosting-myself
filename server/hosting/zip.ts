import { unzipSync } from "fflate";
import { ALLOWED_ASSET_EXT, MAX_UPLOAD_BYTES, MAX_ZIP_FILES, extensionOf } from "./limits";

export interface UnpackedFile {
  path: string;
  data: Uint8Array;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

function normalizeZipPath(raw: string): string | null {
  const posix = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!posix || posix.endsWith("/")) return null;
  const parts = posix.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new ZipError("ZIP に不正なパスが含まれています");
  }
  if (parts.length === 0) return null;
  return parts.join("/");
}

function stripCommonRoot(files: UnpackedFile[]): UnpackedFile[] {
  if (files.length === 0) return files;
  const first = files[0].path.split("/");
  if (first.length < 2) return files;
  const root = first[0];
  if (!files.every((file) => file.path === root || file.path.startsWith(`${root}/`))) {
    return files;
  }
  return files
    .map((file) => ({
      path: file.path === root ? "" : file.path.slice(root.length + 1),
      data: file.data,
    }))
    .filter((file) => file.path.length > 0);
}

function ensureIndexHtml(files: UnpackedFile[]): UnpackedFile[] {
  if (files.some((file) => file.path === "index.html" || file.path === "index.htm")) {
    return files;
  }
  const rootHtml = files.filter(
    (file) =>
      !file.path.includes("/") && (file.path.endsWith(".html") || file.path.endsWith(".htm")),
  );
  if (rootHtml.length === 1) {
    return files.map((file) =>
      file.path === rootHtml[0].path ? { ...file, path: "index.html" } : file,
    );
  }
  throw new ZipError("ZIP のルートに index.html が必要です");
}

export function unpackZip(bytes: Uint8Array): UnpackedFile[] {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new ZipError("ZIP を展開できませんでした");
  }

  const files: UnpackedFile[] = [];
  let total = 0;
  for (const [name, data] of Object.entries(unzipped)) {
    const path = normalizeZipPath(name);
    if (!path) continue;
    const ext = extensionOf(path);
    if (!ALLOWED_ASSET_EXT.has(ext)) {
      throw new ZipError(`許可されていないファイルです: ${path}`);
    }
    total += data.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      throw new ZipError("展開後の合計サイズが上限（10MB）を超えています");
    }
    files.push({ path, data });
    if (files.length > MAX_ZIP_FILES) {
      throw new ZipError(`ZIP 内のファイル数が上限（${MAX_ZIP_FILES}）を超えています`);
    }
  }

  if (files.length === 0) {
    throw new ZipError("ZIP に展開できるファイルがありません");
  }

  return ensureIndexHtml(stripCommonRoot(files));
}

export function extractHtmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title.slice(0, 200) : fallback;
}
