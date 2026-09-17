CREATE TABLE `hosts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`size_bytes` integer NOT NULL,
	`file_count` integer DEFAULT 1 NOT NULL,
	`owner_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hosts_slug_unique` ON `hosts` (`slug`);
