import { Hono } from "hono";
import { createDb } from "../../../db/client";
import { hosts } from "../../../db/schema";
import type { AppEnv } from "../../env";
import { logger } from "../../logger";
import {
  ALLOWED_UPLOAD_EXT,
  DEFAULT_TTL,
  MAX_UPLOAD_BYTES,
  expiresAtFromTtl,
  extensionOf,
  type TtlOption,
} from "../../hosting/limits";
import { generateSlug } from "../../hosting/slug";
import { extractHtmlTitle, unpackZip, ZipError } from "../../hosting/zip";

const ALLOWED_TTL = new Set<TtlOption>(["1d", "7d", "30d", "keep"]);

function parseTtl(raw: FormDataEntryValue | null): TtlOption | null {
  if (raw === null || raw === "") return DEFAULT_TTL;
  if (typeof raw !== "string" || !ALLOWED_TTL.has(raw as TtlOption)) return null;
  return raw as TtlOption;
}

export const uploadRoute = new Hono<AppEnv>().post("/", async (c) => {
  const form = await c.req.formData();
  const uploaded = form.get("file");
  const ttl = parseTtl(form.get("ttl"));
  if (!ttl) {
    return c.json({ error: "ttl は 1d / 7d / 30d / keep のいずれかを指定してください" }, 400);
  }

  if (!(uploaded instanceof File)) {
    return c.json({ error: "file フィールドに HTML または ZIP を指定してください" }, 400);
  }
  if (uploaded.size <= 0) {
    return c.json({ error: "空のファイルはアップロードできません" }, 400);
  }
  if (uploaded.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "ファイルサイズの上限は 10MB です" }, 400);
  }

  const ext = extensionOf(uploaded.name);
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    return c.json({ error: ".html または .zip をアップロードしてください" }, 400);
  }

  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  let files: { path: string; data: Uint8Array }[];
  let title = uploaded.name;

  try {
    if (ext === "zip") {
      files = unpackZip(bytes);
      const index = files.find((file) => file.path === "index.html" || file.path === "index.htm");
      if (index) {
        title = extractHtmlTitle(new TextDecoder().decode(index.data), uploaded.name);
      }
    } else {
      files = [{ path: "index.html", data: bytes }];
      title = extractHtmlTitle(new TextDecoder().decode(bytes), uploaded.name);
    }
  } catch (error) {
    if (error instanceof ZipError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }

  const sizeBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0);
  const now = Date.now();
  const expiresAt = expiresAtFromTtl(ttl, now);
  const ownerEmail = c.get("userEmail") ?? "anonymous";
  const db = createDb(c.env.DB);

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

  await Promise.all(files.map((file) => c.env.BUCKET.put(`${slug}/${file.path}`, file.data)));

  logger.info("host uploaded", {
    requestId: c.get("requestId"),
    slug,
    fileCount: files.length,
    sizeBytes,
    ttl,
  });

  return c.json(
    {
      item: {
        slug,
        title,
        url: `/p/${slug}/`,
        createdAt: now,
        expiresAt,
        sizeBytes,
        fileCount: files.length,
      },
    },
    201,
  );
});
