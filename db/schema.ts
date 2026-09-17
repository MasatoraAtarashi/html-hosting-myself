import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const hosts = sqliteTable("hosts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  // unix ms。null は期限なし（keep）
  expiresAt: integer("expires_at"),
  sizeBytes: integer("size_bytes").notNull(),
  fileCount: integer("file_count").notNull().default(1),
  ownerEmail: text("owner_email").notNull(),
});

export type Host = typeof hosts.$inferSelect;
export type NewHost = typeof hosts.$inferInsert;
