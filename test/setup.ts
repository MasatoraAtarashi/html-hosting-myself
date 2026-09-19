import { beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const migrations = import.meta.glob("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let migrated = false;

beforeAll(async () => {
  const files = Object.keys(migrations).sort();
  const statements = files
    .flatMap((file) => migrations[file].split("--> statement-breakpoint"))
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  if (!migrated && statements.length > 0) {
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
    migrated = true;
  }
});

beforeEach(async () => {
  await env.DB.exec("DELETE FROM annotations;");
  await env.DB.exec("DELETE FROM hosts;");
  const listed = await env.BUCKET.list();
  await Promise.all(listed.objects.map((object) => env.BUCKET.delete(object.key)));
});
