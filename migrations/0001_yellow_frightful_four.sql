CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`page_path` text NOT NULL,
	`kind` text NOT NULL,
	`quote_exact` text NOT NULL,
	`quote_prefix` text DEFAULT '' NOT NULL,
	`quote_suffix` text DEFAULT '' NOT NULL,
	`selector` text,
	`body` text NOT NULL,
	`prompt` text,
	`owner_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `annotations_slug_path_idx` ON `annotations` (`slug`,`page_path`);--> statement-breakpoint
CREATE INDEX `annotations_slug_created_idx` ON `annotations` (`slug`,`created_at`);