CREATE TABLE `faceEnrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tagId` integer NOT NULL,
	`metaId` integer NOT NULL,
	`source` text NOT NULL,
	`sourcePath` text,
	`embedding` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `face_enrollments_tag_id_idx` ON `faceEnrollments` (`tagId`);
--> statement-breakpoint
CREATE INDEX `face_enrollments_meta_id_idx` ON `faceEnrollments` (`metaId`);
--> statement-breakpoint
ALTER TABLE `faces` ADD `tagId` integer;
--> statement-breakpoint
ALTER TABLE `faces` ADD `matchScore` real;
--> statement-breakpoint
ALTER TABLE `faces` ADD `matchStatus` text;
