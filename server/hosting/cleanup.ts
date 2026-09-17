import { logger } from "../logger";

export async function deleteHostObjects(bucket: R2Bucket, slug: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: `${slug}/`, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export async function purgeExpiredHosts(env: Env): Promise<number> {
  const now = Date.now();
  const expired = await env.DB.prepare(
    "SELECT slug FROM hosts WHERE expires_at IS NOT NULL AND expires_at < ?",
  )
    .bind(now)
    .all<{ slug: string }>();

  const slugs = expired.results ?? [];
  for (const row of slugs) {
    await deleteHostObjects(env.BUCKET, row.slug);
    await env.DB.prepare("DELETE FROM hosts WHERE slug = ?").bind(row.slug).run();
  }

  if (slugs.length > 0) {
    logger.info("purged expired hosts", { count: slugs.length });
  }
  return slugs.length;
}
