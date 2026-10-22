-- Historical Drizzle schema from local tag v1.12.0; generated from the tagged SQL, not current schema.
CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);
CREATE TABLE `filterRows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`param` text,
	`type` text,
	`cond` text,
	`val` text,
	`active` integer,
	`note` text,
	`lock` integer,
	`union` text,
	`metaId` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `filterRowsInSavedFilters` (
	`filterId` integer NOT NULL,
	`rowId` integer NOT NULL,
	PRIMARY KEY(`filterId`, `rowId`)
);
--> statement-breakpoint
CREATE TABLE `imageMetadata` (
	`mediaId` integer PRIMARY KEY NOT NULL,
	`width` integer DEFAULT 0,
	`height` integer DEFAULT 0,
	`orientation` integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE `marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`text` text,
	`time` integer,
	`end` integer,
	`tagId` integer,
	`mediaId` integer
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`basename` text,
	`name` text,
	`ext` text,
	`filesize` integer DEFAULT 0,
	`contentHash` text,
	`rating` integer DEFAULT 0,
	`favorite` integer DEFAULT false,
	`bookmark` text,
	`views` integer DEFAULT 0,
	`oldId` text,
	`viewedAt` text,
	`mediaTypeId` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_path_unique` ON `media` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_oldId_unique` ON `media` (`oldId`);--> statement-breakpoint
CREATE TABLE `mediaInPlaylists` (
	`mediaId` integer NOT NULL,
	`playlistId` integer NOT NULL,
	`order` integer,
	PRIMARY KEY(`mediaId`, `playlistId`)
);
--> statement-breakpoint
CREATE TABLE `mediaTypes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`nameSingular` text,
	`icon` text,
	`extensions` text,
	`order` integer,
	`hidden` integer DEFAULT false,
	`custom` integer DEFAULT true,
	`type` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mediaTypesInWatchedFolders` (
	`folderId` integer NOT NULL,
	`mediaTypeId` integer NOT NULL,
	PRIMARY KEY(`folderId`, `mediaTypeId`)
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`name` text,
	`nameSingular` text,
	`icon` text,
	`hint` text,
	`order` integer,
	`views` integer DEFAULT 0,
	`oldId` text,
	`synonyms` integer DEFAULT false,
	`hidden` integer DEFAULT false,
	`nested` integer DEFAULT false,
	`marks` integer DEFAULT false,
	`bookmark` integer DEFAULT false,
	`parser` integer DEFAULT false,
	`country` integer DEFAULT false,
	`career` integer DEFAULT false,
	`scraper` integer DEFAULT false,
	`rating` integer DEFAULT false,
	`favorite` integer DEFAULT true,
	`chipVariant` text DEFAULT 'flat',
	`chipLabel` integer DEFAULT false,
	`color` integer DEFAULT false,
	`imageAspectRatio` real DEFAULT 1,
	`isLink` integer DEFAULT false,
	`ratingIcon` text DEFAULT 'star',
	`ratingIconEmpty` text DEFAULT 'star-outline',
	`ratingIconHalf` text DEFAULT 'star-half-full',
	`ratingMax` integer DEFAULT 5,
	`ratingColor` text DEFAULT '#ffab00',
	`ratingHalf` integer DEFAULT false,
	`sortBy` text DEFAULT 'createdAt',
	`sortDir` text DEFAULT 'asc',
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metaInMediaTypes` (
	`metaId` integer NOT NULL,
	`mediaTypeId` integer NOT NULL,
	`scraper` text,
	`show` integer DEFAULT true,
	`order` integer,
	PRIMARY KEY(`metaId`, `mediaTypeId`)
);
--> statement-breakpoint
CREATE TABLE `metaSettings` (
	`metaId` integer PRIMARY KEY NOT NULL,
	`synonyms` integer DEFAULT false,
	`hidden` integer DEFAULT false,
	`nested` integer DEFAULT false,
	`marks` integer DEFAULT false,
	`bookmark` integer DEFAULT false,
	`parser` integer DEFAULT false,
	`country` integer DEFAULT false,
	`career` integer DEFAULT false,
	`scraper` integer DEFAULT false,
	`rating` integer DEFAULT false,
	`favorite` integer DEFAULT true,
	`chipOutlined` integer DEFAULT false,
	`chipLabel` integer DEFAULT false,
	`color` integer DEFAULT false,
	`imageAspectRatio` real DEFAULT 1,
	`isLink` integer DEFAULT false,
	`ratingIcon` text DEFAULT 'star',
	`ratingIconEmpty` text DEFAULT 'star-outline',
	`ratingIconHalf` text DEFAULT 'star-half-full',
	`ratingMax` integer DEFAULT 5,
	`ratingColor` text DEFAULT '#ffab00',
	`ratingHalf` integer DEFAULT false,
	`sortBy` text DEFAULT 'createdAt',
	`sortDir` text DEFAULT 'asc'
);
--> statement-breakpoint
CREATE TABLE `pageSettings` (
	`page` integer DEFAULT 1,
	`size` integer DEFAULT 3,
	`view` integer DEFAULT 1,
	`limit` integer DEFAULT 101,
	`sortBy` text DEFAULT 'createdAt',
	`sortDir` text DEFAULT 'asc',
	`firstChar` text,
	`colors` text,
	`metaId` integer,
	`mediaTypeId` integer,
	`tagId` integer,
	`filterId` integer,
	`tabId` integer
);
--> statement-breakpoint
CREATE TABLE `pinnedMetas` (
	`metaId` integer NOT NULL,
	`pinnedMetaId` integer NOT NULL,
	`scraper` text,
	`show` integer DEFAULT true,
	`order` integer,
	PRIMARY KEY(`metaId`, `pinnedMetaId`)
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`favorite` integer DEFAULT false,
	`oldId` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `savedFilters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`metaId` integer,
	`mediaTypeId` integer,
	`tagId` integer,
	`tabId` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`option` text,
	`value` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_option_unique` ON `settings` (`option`);--> statement-breakpoint
CREATE TABLE `tabs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`icon` text,
	`url` text,
	`order` integer DEFAULT 0,
	`metaId` integer,
	`mediaTypeId` integer,
	`tagId` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`oldId` text,
	`name` text NOT NULL,
	`synonyms` text,
	`rating` integer DEFAULT 0 NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`bookmark` text,
	`country` text,
	`color` text,
	`views` integer DEFAULT 0,
	`viewedAt` text,
	`metaId` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_oldId_unique` ON `tags` (`oldId`);--> statement-breakpoint
CREATE TABLE `tagsInFilterRows` (
	`tagId` integer NOT NULL,
	`rowId` integer NOT NULL,
	`metaId` integer NOT NULL,
	PRIMARY KEY(`tagId`, `rowId`, `metaId`)
);
--> statement-breakpoint
CREATE TABLE `tagsInMedia` (
	`mediaId` integer NOT NULL,
	`tagId` integer NOT NULL,
	`metaId` integer NOT NULL,
	PRIMARY KEY(`mediaId`, `tagId`, `metaId`)
);
--> statement-breakpoint
CREATE TABLE `tagsInTags` (
	`parentTagId` integer NOT NULL,
	`tagId` integer NOT NULL,
	`metaId` integer NOT NULL,
	PRIMARY KEY(`parentTagId`, `tagId`, `metaId`)
);
--> statement-breakpoint
CREATE TABLE `valuesInMedia` (
	`mediaId` integer NOT NULL,
	`metaId` integer NOT NULL,
	`value` text,
	PRIMARY KEY(`mediaId`, `metaId`)
);
--> statement-breakpoint
CREATE TABLE `valuesInTags` (
	`tagId` integer NOT NULL,
	`metaId` integer NOT NULL,
	`value` text,
	PRIMARY KEY(`tagId`, `metaId`)
);
--> statement-breakpoint
CREATE TABLE `videoMetadata` (
	`mediaId` integer PRIMARY KEY NOT NULL,
	`duration` integer DEFAULT 0,
	`width` integer DEFAULT 0,
	`height` integer DEFAULT 0,
	`bitrate` integer DEFAULT 0,
	`fps` integer DEFAULT 0,
	`time` integer,
	`codec` text
);
--> statement-breakpoint
CREATE TABLE `watchedFolders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text,
	`name` text,
	`watch` integer DEFAULT true,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('c483474381c90ce1113777c060648d1cc5d5acf1249804de1dcbf589b22052b7',1782752532360);
CREATE INDEX IF NOT EXISTS `media_content_hash_idx` ON `media` (`contentHash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_idx` ON `media` (`mediaTypeId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_media_id_idx` ON `tagsInMedia` (`mediaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_tag_meta_idx` ON `tagsInMedia` (`tagId`,`metaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `values_in_media_media_id_idx` ON `valuesInMedia` (`mediaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `values_in_media_meta_media_idx` ON `valuesInMedia` (`metaId`,`mediaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_in_playlists_playlist_id_idx` ON `mediaInPlaylists` (`playlistId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `filter_rows_in_saved_filter_filter_id_idx` ON `filterRowsInSavedFilters` (`filterId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_filter_row_row_id_idx` ON `tagsInFilterRows` (`rowId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_id_idx` ON `media` (`mediaTypeId`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_created_at_idx` ON `media` (`mediaTypeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_updated_at_idx` ON `media` (`mediaTypeId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_rating_idx` ON `media` (`mediaTypeId`,`rating`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_viewed_at_idx` ON `media` (`mediaTypeId`,`viewedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_views_idx` ON `media` (`mediaTypeId`,`views`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_favorite_idx` ON `media` (`mediaTypeId`,`favorite`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('b1873f5d6df9c28a320bfc4e9f1bdeefdbc25c3b752ac4055e30f9e3420504ab',1782753600000);
ALTER TABLE `meta` ADD `tagPageDesign` text DEFAULT 'profile';

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('dcbefedcea74f39bac40999e44bdd1fe5fbb2acbd935bf61454fc209692fc723',1782757200000);
CREATE INDEX IF NOT EXISTS `media_media_type_id_filesize_idx` ON `media` (`mediaTypeId`, `filesize`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_content_hash_idx` ON `media` (`mediaTypeId`, `contentHash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_filesize_idx` ON `media` (`filesize`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('6c0abe57e52cfc16aa36516cb3505657020df623bbeb744602d17a46f1f1a0b3',1782760800000);
CREATE INDEX IF NOT EXISTS `media_media_type_id_basename_filesize_idx` ON `media` (`mediaTypeId`, `basename`, `filesize`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('095884220959f4ed401f12b1765cf945b55e8f27bda8a27f3eb575f88453b45a',1782764400000);
ALTER TABLE `meta` ADD `autoColorFromImage` integer DEFAULT 0;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('2ad289e17fedc3f2bf5699937a7119d35ae79ce3d8d11ca5341e4d6d92767081',1782768000000);
ALTER TABLE `meta` DROP COLUMN `nameSingular`;
--> statement-breakpoint
ALTER TABLE `mediaTypes` DROP COLUMN `nameSingular`;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('155282d267094f4b297c3aee9a0ca327b08d1057edab63a9e272bddf68d09084',1782771600000);
ALTER TABLE `media` ADD COLUMN `oshash` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_oshash_idx` ON `media` (`mediaTypeId`, `oshash`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('afd0447cb08de48c02616ecb5ce8883f4141f3f60b0b06ee6bce05214478ab13',1782775200000);
CREATE UNIQUE INDEX IF NOT EXISTS `video_metadata_media_id_idx` ON `videoMetadata` (`mediaId`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('7675d2e7adbe2c864d3b571021b2ad5c63cef9216242076c26a628f493ec0c1f',1782778800000);
ALTER TABLE `filterRows` ADD COLUMN `order` integer DEFAULT 0;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('9ae8d8e71b96154377b6cc9dee7ba3dfef8981ae674552cd183a3fd11fcaf143',1782782400000);
ALTER TABLE `meta` ADD `measurementUnit` text;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('c161cd83acd1a448980a1dbb02bde1f172d17cccaa52c26d878192a65e38db08',1782786000000);
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

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('1747ad565229edc2468c8a14b1c76df0dd923bbdf33517714c711dd64b0e7be0',1782789600000);
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

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('ab0493686b914bb606bcb7a4cb89f74f163c69b5685e1b6fab742f03923fdad9',1782793200000);
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

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('7715b030d742b92631731d7d6eb2714e524536811def6b87588b638c985e997b',1782796800000);
ALTER TABLE `meta` ADD `pathRegex` text;--> statement-breakpoint
ALTER TABLE `meta` ADD `pathRegexReplace` text DEFAULT '$1';--> statement-breakpoint
ALTER TABLE `meta` ADD `pathRegexCreateTags` integer DEFAULT 1;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('4a1223c774e0ac01eecaf3b17bd0ade1b1cbd589d7811a7dda52037b4a4047be',1782800400000);
ALTER TABLE `meta` ADD `pathRegexEnabled` integer DEFAULT 0;--> statement-breakpoint
UPDATE `meta` SET `pathRegexEnabled` = 1 WHERE `pathRegex` IS NOT NULL AND TRIM(`pathRegex`) != '';

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('a1eab0d3a1de13c82f9a6f5720ea27859b4668594743e589dfa7967cd670c49a',1782804000000);
ALTER TABLE `media` ADD COLUMN `visualHash` text;--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `visualHashTiles` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_visual_hash_idx` ON `media` (`mediaTypeId`, `visualHash`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('7994ea897bf705cb254ab6b9ba6d2ab56fc3080eb1ce398a85d2e65a76d7719a',1782807600000);
CREATE UNIQUE INDEX IF NOT EXISTS `tags_name_normalized_unique` ON `tags` (lower(trim(`name`)));

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('74595c6d43a8a2854cae28a777fb27a49811cdd316c60f33b363ff9afcb3b26c',1782811200000);
CREATE INDEX IF NOT EXISTS `tags_in_folders_meta_tag_idx` ON `tagsInFolders` (`metaId`,`tagId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_meta_media_idx` ON `tagsInMedia` (`metaId`,`mediaId`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('60b0c48348fd97e37e950841d7597c8e9357ad24651bdf8cc9f19905790a86bc',1782814800000);
CREATE INDEX IF NOT EXISTS `media_favorite_id_idx` ON `media` (`favorite`,`id`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('349723996cdc6961f5cbf3f60277ec5e9c7114b86d623538b894c8abccac89d8',1782818400000);
CREATE TABLE `mediaClipEmbeddings` (
	`mediaId` integer PRIMARY KEY NOT NULL,
	`embedding` blob NOT NULL,
	`dims` integer NOT NULL,
	`model` text NOT NULL,
	`updatedAt` text NOT NULL
);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('8021bf318bda04dbcde9477d17a0225f6774f3e28d293af05086d3375251712d',1782822000000);
CREATE INDEX IF NOT EXISTS `faces_tag_id_idx` ON `faces` (`tagId`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('9dbb4c28d4cbe3afc60a3f9c75dfeb4f44eaafe19b9c5033e474f0a6de85b7d2',1782825600000);
ALTER TABLE `media` ADD COLUMN `mediaCreatedAt` text;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('f70420e16ac86d25206249205c3c42fbae235093dd58e35b0f293bdbdfc52ba3',1782829200000);
ALTER TABLE `watchedFolders` ADD COLUMN `icon` text;--> statement-breakpoint
ALTER TABLE `watchedFolders` ADD COLUMN `excludedPaths` text;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('2d73cf83977d3c6fa11da8084da8d997555df184a185cb2569e504236e1c360c',1782832800000);
ALTER TABLE `savedFilters` ADD COLUMN `filtersJoin` text DEFAULT 'and';

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('20cbc31b99868e8e86fc9f3dc7f5186fc0e92ffe8aba74d9c5f39a04d29d09c7',1782836400000);
CREATE INDEX IF NOT EXISTS `tags_in_tags_tag_id_idx` ON `tagsInTags` (`tagId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_tag_meta_idx` ON `tagsInMedia` (`tagId`,`metaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_media_id_idx` ON `tagsInMedia` (`mediaId`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('7182d8fbef6166d3e29c0512b3363ff9f14086dda7fec9c18776d73f6a3b69e3',1782840000000);
ALTER TABLE `marks` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `playlists` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `savedFilters` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD COLUMN `deletedAt` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD COLUMN `trashOriginalName` text;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('f4b79742d269b7e699e1aec6c4f447ed128adb064f7c4811f33446387c189b3a',1782843600000);
ALTER TABLE `savedFilters` ADD COLUMN `icon` text;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('40d3026c4a253b10d983e6face47a4bed85b0539a869a1ffcdaf887ca2ef7456',1782847200000);
DROP INDEX IF EXISTS `tags_name_normalized_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_normalized_unique` ON `tags` (lower(trim(`name`))) WHERE `deletedAt` IS NULL OR `deletedAt` = '';

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('d1263de1142461cc5cab389093f2ebd2f59e7d23b5c90d9f5fb5bc368441c138',1782850800000);
ALTER TABLE `meta` ADD `parentMetaId` integer;--> statement-breakpoint
ALTER TABLE `tags` ADD `parentTagId` integer;

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('33cae0e54be7254748ef4250eb6b28bbd41cd3f26cc60dace3105671b4e4eb4d',1782854400000);
CREATE INDEX `meta_parent_meta_id_idx` ON `meta` (`parentMetaId`);--> statement-breakpoint
CREATE INDEX `tags_parent_tag_id_idx` ON `tags` (`parentTagId`);

INSERT INTO __drizzle_migrations(hash,created_at) VALUES ('e523433cd9605b841d0b2253015559d3b2c92276630a22904c8a8584fc6c22e2',1782858000000);
-- Columns maintained by schemaRepair in the same tag.
ALTER TABLE "marks" ADD COLUMN "icon" text;
ALTER TABLE "media" ADD COLUMN "deletedAt" text;
ALTER TABLE "media" ADD COLUMN "trashOriginalPath" text;
ALTER TABLE "media" ADD COLUMN "trashPurgeFile" integer DEFAULT 0;
ALTER TABLE "faces" ADD COLUMN "embedding" text;
ALTER TABLE "videoMetadata" ADD COLUMN "title" text;
ALTER TABLE "videoMetadata" ADD COLUMN "artist" text;
ALTER TABLE "videoMetadata" ADD COLUMN "album" text;
ALTER TABLE "savedFilters" ADD COLUMN "sortBy" text;
ALTER TABLE "savedFilters" ADD COLUMN "sortDir" text;
ALTER TABLE "savedFilters" ADD COLUMN "size" integer;
ALTER TABLE "savedFilters" ADD COLUMN "view" integer;
ALTER TABLE "savedFilters" ADD COLUMN "groupBy" text;
