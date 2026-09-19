import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

// ページ上の選択箇所に紐づく個人メモ / AI 追記リサーチ。
// D1 の FK は接続ごとに PRAGMA が必要で掃除漏れしやすいので、ホスト削除時はアプリ側で消す。
export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    pagePath: text("page_path").notNull(),
    kind: text("kind").notNull(),
    quoteExact: text("quote_exact").notNull(),
    quotePrefix: text("quote_prefix").notNull().default(""),
    quoteSuffix: text("quote_suffix").notNull().default(""),
    selector: text("selector"),
    body: text("body").notNull(),
    prompt: text("prompt"),
    ownerEmail: text("owner_email").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("annotations_slug_path_idx").on(table.slug, table.pagePath),
    index("annotations_slug_created_idx").on(table.slug, table.createdAt),
  ],
);

export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
