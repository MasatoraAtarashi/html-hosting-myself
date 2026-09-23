import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { createDb } from "../../../db/client";
import { DEFAULT_TTL, MAX_BATCH_UPLOADS, type TtlOption } from "../../hosting/limits";
import {
  UploadError,
  createHostFromFile,
  createHostFromHtml,
  type HostItem,
} from "../../hosting/create-host";

const ALLOWED_TTL = new Set<TtlOption>(["1d", "7d", "30d", "keep"]);

function parseTtl(raw: FormDataEntryValue | null): TtlOption | null {
  if (raw === null || raw === "") return DEFAULT_TTL;
  if (typeof raw !== "string" || !ALLOWED_TTL.has(raw as TtlOption)) return null;
  return raw as TtlOption;
}

function collectFiles(form: FormData): File[] {
  return form.getAll("file").filter((value): value is File => value instanceof File);
}

function readTextField(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

export const uploadRoute = new Hono<AppEnv>().post("/", async (c) => {
  const form = await c.req.formData();
  const ttl = parseTtl(form.get("ttl"));
  if (!ttl) {
    return c.json({ error: "ttl は 1d / 7d / 30d / keep のいずれかを指定してください" }, 400);
  }

  const uploaded = collectFiles(form);
  const html = readTextField(form.get("html"));
  const title = readTextField(form.get("title"));
  const hasHtml = html !== null && html.trim().length > 0;

  if (hasHtml && uploaded.length > 0) {
    return c.json({ error: "file と html は同時に指定できません" }, 400);
  }

  if (html !== null && uploaded.length === 0) {
    try {
      const item = await createHostFromHtml({
        html,
        title,
        ttl,
        ownerEmail: c.get("userEmail") ?? "anonymous",
        db: createDb(c.env.DB),
        bucket: c.env.BUCKET,
        requestId: c.get("requestId"),
      });
      return c.json({ item }, 201);
    } catch (error) {
      if (error instanceof UploadError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }

  if (uploaded.length === 0) {
    return c.json(
      { error: "file に HTML または ZIP を指定するか、html に貼り付けた HTML を指定してください" },
      400,
    );
  }
  if (uploaded.length > MAX_BATCH_UPLOADS) {
    return c.json({ error: `一度に置けるのは ${MAX_BATCH_UPLOADS} 件までです` }, 400);
  }

  const ownerEmail = c.get("userEmail") ?? "anonymous";
  const db = createDb(c.env.DB);
  const requestId = c.get("requestId");

  if (uploaded.length === 1) {
    try {
      const item = await createHostFromFile({
        file: uploaded[0],
        ttl,
        ownerEmail,
        db,
        bucket: c.env.BUCKET,
        requestId,
      });
      return c.json({ item }, 201);
    } catch (error) {
      if (error instanceof UploadError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }

  const items: HostItem[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const file of uploaded) {
    try {
      items.push(
        await createHostFromFile({
          file,
          ttl,
          ownerEmail,
          db,
          bucket: c.env.BUCKET,
          requestId,
        }),
      );
    } catch (error) {
      if (error instanceof UploadError) {
        errors.push({ name: file.name || "unnamed", error: error.message });
        continue;
      }
      throw error;
    }
  }

  if (items.length === 0) {
    return c.json({ error: "どのファイルも置けませんでした", errors }, 400);
  }
  if (errors.length === 0) {
    return c.json({ items, item: items[0] }, 201);
  }
  return c.json({ items, errors }, 200);
});
