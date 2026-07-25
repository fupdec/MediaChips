CREATE TABLE `folderPaths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_paths_path_unique_idx` ON `folderPaths` (`path`);
--> statement-breakpoint
CREATE TABLE `tagsInFolders` (
	`folderId` integer NOT NULL,
	`tagId` integer NOT NULL,
	`metaId` integer NOT NULL,
	PRIMARY KEY(`folderId`, `tagId`, `metaId`)
);
