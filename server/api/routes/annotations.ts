import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generateFollowup } from "../../ai/research";
import { createDb } from "../../../db/client";
import { annotations, hosts } from "../../../db/schema";
import type { AppEnv } from "../../env";
import { normalizePagePath } from "../../hosting/page-path";
import { logger } from "../../logger";
import { rejectAnonymous } from "../../middleware/access-auth";

const MAX_ANNOTATIONS_PER_HOST = 200;
const MAX_RESEARCH_PER_HOUR = 20;
const RESEARCH_WINDOW_MS = 60 * 60 * 1000;

const slugParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]{6,16}$/),
});

const idParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]{6,16}$/),
  id: z.string().uuid(),
});

const quoteSchema = z.object({
  exact: z.string().trim().min(1).max(2000),
  prefix: z.string().max(200).optional().default(""),
  suffix: z.string().max(200).optional().default(""),
});

const memoBodySchema = z.object({
  pagePath: z.string().max(512).optional(),
  quote: quoteSchema,
  selector: z.string().max(500).optional(),
  body: z.string().trim().min(1).max(8000),
});

const researchBodySchema = z.object({
  pagePath: z.string().max(512).optional(),
  quote: quoteSchema,
  selector: z.string().max(500).optional(),
  prompt: z.string().trim().max(1000).optional(),
  pageTitle: z.string().max(300).optional(),
  context: z.string().max(4000).optional(),
});

const patchBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

function toItem(row: typeof annotations.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    pagePath: row.pagePath,
    kind: row.kind,
    quote: {
      exact: row.quoteExact,
      prefix: row.quotePrefix,
      suffix: row.quoteSuffix,
    },
    selector: row.selector,
    body: row.body,
    prompt: row.prompt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireHost(db: ReturnType<typeof createDb>, slug: string) {
  const [host] = await db
    .select({ slug: hosts.slug, title: hosts.title })
    .from(hosts)
    .where(eq(hosts.slug, slug))
    .limit(1);
  return host ?? null;
}

export const annotationsRoute = new Hono<AppEnv>()
  .use("*", rejectAnonymous)
  .get("/", zValidator("param", slugParamSchema), async (c) => {
    const { slug } = c.req.valid("param");
    const rawPath = c.req.query("path");
    let pagePath: string | undefined;
    if (rawPath !== undefined) {
      const normalized = normalizePagePath(rawPath);
      if (!normalized) {
        return c.json({ error: "path が不正です" }, 400);
      }
      pagePath = normalized;
    }
    const db = createDb(c.env.DB);
    const filters = pagePath
      ? and(eq(annotations.slug, slug), eq(annotations.pagePath, pagePath))
      : eq(annotations.slug, slug);
    const rows = await db
      .select()
      .from(annotations)
      .where(filters)
      .orderBy(desc(annotations.createdAt));
    return c.json({ items: rows.map(toItem) });
  })
  .post(
    "/",
    zValidator("param", slugParamSchema),
    zValidator("json", memoBodySchema),
    async (c) => {
      const { slug } = c.req.valid("param");
      const input = c.req.valid("json");
      const pagePath = normalizePagePath(input.pagePath);
      if (!pagePath) {
        return c.json({ error: "pagePath が不正です" }, 400);
      }
      const db = createDb(c.env.DB);
      const host = await requireHost(db, slug);
      if (!host) {
        return c.json({ error: "Not Found" }, 404);
      }
      const [{ n }] = await db
        .select({ n: count() })
        .from(annotations)
        .where(eq(annotations.slug, slug));
      if (n >= MAX_ANNOTATIONS_PER_HOST) {
        return c.json({ error: "このページのメモ上限に達しています" }, 429);
      }
      const now = Date.now();
      const row = {
        id: crypto.randomUUID(),
        slug,
        pagePath,
        kind: "memo" as const,
        quoteExact: input.quote.exact,
        quotePrefix: input.quote.prefix ?? "",
        quoteSuffix: input.quote.suffix ?? "",
        selector: input.selector ?? null,
        body: input.body,
        prompt: null,
        ownerEmail: c.get("userEmail"),
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(annotations).values(row);
      logger.info("annotation memo created", {
        requestId: c.get("requestId"),
        slug,
        id: row.id,
      });
      return c.json({ item: toItem(row) }, 201);
    },
  )
  .post(
    "/research",
    zValidator("param", slugParamSchema),
    zValidator("json", researchBodySchema),
    async (c) => {
      const { slug } = c.req.valid("param");
      const input = c.req.valid("json");
      const pagePath = normalizePagePath(input.pagePath);
      if (!pagePath) {
        return c.json({ error: "pagePath が不正です" }, 400);
      }
      const db = createDb(c.env.DB);
      const host = await requireHost(db, slug);
      if (!host) {
        return c.json({ error: "Not Found" }, 404);
      }
      const [{ n }] = await db
        .select({ n: count() })
        .from(annotations)
        .where(eq(annotations.slug, slug));
      if (n >= MAX_ANNOTATIONS_PER_HOST) {
        return c.json({ error: "このページのメモ上限に達しています" }, 429);
      }
      const hourAgo = Date.now() - RESEARCH_WINDOW_MS;
      const [{ n: recent }] = await db
        .select({ n: count() })
        .from(annotations)
        .where(
          and(
            eq(annotations.slug, slug),
            eq(annotations.kind, "research"),
            gt(annotations.createdAt, hourAgo),
          ),
        );
      if (recent >= MAX_RESEARCH_PER_HOUR) {
        return c.json({ error: "追記リサーチの回数上限です。しばらく待ってください" }, 429);
      }

      let body: string;
      try {
        body = await generateFollowup(c.env, {
          pageTitle: input.pageTitle?.trim() || host.title,
          pageUrl: new URL(`/p/${slug}/${pagePath === "index.html" ? "" : pagePath}`, c.req.url)
            .href,
          quote: input.quote.exact,
          context: input.context ?? "",
          prompt: input.prompt ?? "",
        });
      } catch (error) {
        logger.error("workers ai research failed", {
          requestId: c.get("requestId"),
          slug,
          error: error instanceof Error ? error.message : String(error),
        });
        return c.json(
          { error: "追記リサーチに失敗しました。Workers AI が有効か確認してください" },
          503,
        );
      }
      body = body.trim();
      if (!body) {
        return c.json({ error: "追記リサーチの結果が空でした" }, 503);
      }
      if (body.length > 16_000) {
        body = body.slice(0, 16_000);
      }

      const now = Date.now();
      const row = {
        id: crypto.randomUUID(),
        slug,
        pagePath,
        kind: "research" as const,
        quoteExact: input.quote.exact,
        quotePrefix: input.quote.prefix ?? "",
        quoteSuffix: input.quote.suffix ?? "",
        selector: input.selector ?? null,
        body,
        prompt: input.prompt?.trim() ? input.prompt.trim() : null,
        ownerEmail: c.get("userEmail"),
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(annotations).values(row);
      logger.info("annotation research created", {
        requestId: c.get("requestId"),
        slug,
        id: row.id,
        model: "workers-ai",
      });
      return c.json({ item: toItem(row) }, 201);
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", patchBodySchema),
    async (c) => {
      const { slug, id } = c.req.valid("param");
      const { body } = c.req.valid("json");
      const db = createDb(c.env.DB);
      const now = Date.now();
      const [updated] = await db
        .update(annotations)
        .set({ body, updatedAt: now })
        .where(and(eq(annotations.slug, slug), eq(annotations.id, id)))
        .returning();
      if (!updated) {
        return c.json({ error: "Not Found" }, 404);
      }
      return c.json({ item: toItem(updated) });
    },
  )
  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const { slug, id } = c.req.valid("param");
    const db = createDb(c.env.DB);
    const [deleted] = await db
      .delete(annotations)
      .where(and(eq(annotations.slug, slug), eq(annotations.id, id)))
      .returning({ id: annotations.id });
    if (!deleted) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.body(null, 204);
  });
