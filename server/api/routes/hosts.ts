import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../../../db/client";
import { annotations, hosts } from "../../../db/schema";
import type { AppEnv } from "../../env";
import { deleteHostObjects } from "../../hosting/cleanup";
import { expiresAtFromTtl, type TtlOption } from "../../hosting/limits";
import { isValidSlug } from "../../hosting/slug";
import { annotationsRoute } from "./annotations";

const slugParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]{6,16}$/),
});

const ttlBodySchema = z.object({
  ttl: z.enum(["1d", "7d", "30d", "keep"]),
});

export const hostsRoute = new Hono<AppEnv>()
  .route("/:slug/annotations", annotationsRoute)
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const items = await db.select().from(hosts).orderBy(desc(hosts.createdAt));
    return c.json({
      items: items.map((item) => ({
        slug: item.slug,
        title: item.title,
        url: `/p/${item.slug}/`,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        sizeBytes: item.sizeBytes,
        fileCount: item.fileCount,
      })),
    });
  })
  .patch(
    "/:slug",
    zValidator("param", slugParamSchema),
    zValidator("json", ttlBodySchema),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { ttl } = c.req.valid("json");
      const db = createDb(c.env.DB);
      const expiresAt = expiresAtFromTtl(ttl as TtlOption);
      const [updated] = await db
        .update(hosts)
        .set({ expiresAt })
        .where(eq(hosts.slug, slug))
        .returning();
      if (!updated) {
        return c.json({ error: "Not Found" }, 404);
      }
      return c.json({
        item: {
          slug: updated.slug,
          title: updated.title,
          url: `/p/${updated.slug}/`,
          createdAt: updated.createdAt,
          expiresAt: updated.expiresAt,
          sizeBytes: updated.sizeBytes,
          fileCount: updated.fileCount,
        },
      });
    },
  )
  .delete("/:slug", zValidator("param", slugParamSchema), async (c) => {
    const { slug } = c.req.valid("param");
    if (!isValidSlug(slug)) {
      return c.json({ error: "Not Found" }, 404);
    }
    const db = createDb(c.env.DB);
    const [existing] = await db
      .select({ slug: hosts.slug })
      .from(hosts)
      .where(eq(hosts.slug, slug))
      .limit(1);
    if (!existing) {
      return c.json({ error: "Not Found" }, 404);
    }
    await db.delete(annotations).where(eq(annotations.slug, slug));
    await db.delete(hosts).where(eq(hosts.slug, slug));
    await deleteHostObjects(c.env.BUCKET, slug);
    return c.body(null, 204);
  });
