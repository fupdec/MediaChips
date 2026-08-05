CREATE INDEX IF NOT EXISTS `tags_in_folders_meta_tag_idx` ON `tagsInFolders` (`metaId`,`tagId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_meta_media_idx` ON `tagsInMedia` (`metaId`,`mediaId`);
