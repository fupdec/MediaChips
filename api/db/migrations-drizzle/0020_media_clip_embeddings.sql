CREATE TABLE `mediaClipEmbeddings` (
	`mediaId` integer PRIMARY KEY NOT NULL,
	`embedding` blob NOT NULL,
	`dims` integer NOT NULL,
	`model` text NOT NULL,
	`updatedAt` text NOT NULL
);
