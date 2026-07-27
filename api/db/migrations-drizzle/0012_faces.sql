CREATE TABLE `faces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mediaId` integer NOT NULL,
	`timestamp` text,
	`score` real DEFAULT 0 NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`width` real DEFAULT 0 NOT NULL,
	`height` real DEFAULT 0 NOT NULL,
	`cropPath` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `faces_media_id_idx` ON `faces` (`mediaId`);
