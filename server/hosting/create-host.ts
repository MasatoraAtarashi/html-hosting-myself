import type { Db } from "../../db/client";
import { hosts } from "../../db/schema";
import { logger } from "../logger";
import {
  ALLOWED_UPLOAD_EXT,
  MAX_UPLOAD_BYTES,
  expiresAtFromTtl,
  extensionOf,
  type TtlOption,
} from "./limits";
import { preparePastedHtml } from "./paste-html";
import { generateSlug } from "./slug";
import { extractHtmlTitle, unpackZip, ZipError } from "./zip";

export interface HostItem {
  slug: string;
  title: string;
  url: string;
  createdAt: number;
  expiresAt: number | null;
  sizeBytes: number;
  fileCount: number;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

async function storeHost(input: {
  title: string;
  files: { path: string; data: Uint8Array }[];
  ttl: TtlOption;
  ownerEmail: string;
  db: Db;
  bucket: R2Bucket;
  requestId?: string;
  source: "file" | "paste";
}): Promise<HostItem> {
  const { title, files, ttl, ownerEmail, db, bucket, requestId, source } = input;
  const sizeBytes = files.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  const now = Date.now();
  const expiresAt = expiresAtFromTtl(ttl, now);

  let slug = generateSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(hosts).values({
        slug,
        title,
        createdAt: now,
        expiresAt,
        sizeBytes,
        fileCount: files.length,
        ownerEmail,
      });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      slug = generateSlug();
    }
  }

  await Promise.all(files.map((entry) => bucket.put(`${slug}/${entry.path}`, entry.data)));

  logger.info("host uploaded", {
    requestId,
    slug,
    fileCount: files.length,
    sizeBytes,
    ttl,
    source,
  });

  return {
    slug,
    title,
    url: `/p/${slug}/`,
    createdAt: now,
    expiresAt,
    sizeBytes,
    fileCount: files.length,
  };
}

export async function createHostFromFile(input: {
  file: File;
  ttl: TtlOption;
  ownerEmail: string;
  db: Db;
  bucket: R2Bucket;
  requestId?: string;
}): Promise<HostItem> {
  const { file, ttl, ownerEmail, db, bucket, requestId } = input;
  if (file.size <= 0) {
    throw new UploadError("空のファイルはアップロードできません");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("ファイルサイズの上限は 10MB です");
  }

  const ext = extensionOf(file.name);
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    throw new UploadError(".html または .zip をアップロードしてください");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let files: { path: string; data: Uint8Array }[];
  let title = file.name;

  try {
    if (ext === "zip") {
      files = unpackZip(bytes);
      const index = files.find(
        (entry) => entry.path === "index.html" || entry.path === "index.htm",
      );
      if (index) {
        title = extractHtmlTitle(new TextDecoder().decode(index.data), file.name);
      }
    } else {
      files = [{ path: "index.html", data: bytes }];
      title = extractHtmlTitle(new TextDecoder().decode(bytes), file.name);
    }
  } catch (error) {
    if (error instanceof ZipError) {
      throw new UploadError(error.message);
    }
    throw error;
  }

  return storeHost({
    title,
    files,
    ttl,
    ownerEmail,
    db,
    bucket,
    requestId,
    source: "file",
  });
}

export async function createHostFromHtml(input: {
  html: string;
  title?: string | null;
  ttl: TtlOption;
  ownerEmail: string;
  db: Db;
  bucket: R2Bucket;
  requestId?: string;
}): Promise<HostItem> {
  const prepared = preparePastedHtml(input.html, input.title ?? null);
  if (!prepared.ok) {
    throw new UploadError(prepared.error);
  }

  return storeHost({
    title: prepared.title,
    files: [{ path: "index.html", data: prepared.bytes }],
    ttl: input.ttl,
    ownerEmail: input.ownerEmail,
    db: input.db,
    bucket: input.bucket,
    requestId: input.requestId,
    source: "paste",
  });
}
