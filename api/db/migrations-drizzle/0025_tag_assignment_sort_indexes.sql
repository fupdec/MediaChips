CREATE INDEX IF NOT EXISTS `tags_in_tags_tag_id_idx` ON `tagsInTags` (`tagId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_tag_meta_idx` ON `tagsInMedia` (`tagId`,`metaId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_in_media_media_id_idx` ON `tagsInMedia` (`mediaId`);
