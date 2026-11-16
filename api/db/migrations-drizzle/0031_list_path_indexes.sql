CREATE INDEX IF NOT EXISTS `media_media_type_id_name_idx` ON `media` (`mediaTypeId`, `name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_path_idx` ON `media` (`mediaTypeId`, `path`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_ext_idx` ON `media` (`mediaTypeId`, `ext`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_media_created_at_idx` ON `media` (`mediaTypeId`, `mediaCreatedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_metadata_duration_idx` ON `videoMetadata` (`duration`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_meta_id_id_idx` ON `tags` (`metaId`, `id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_meta_id_name_idx` ON `tags` (`metaId`, `name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_meta_id_created_at_idx` ON `tags` (`metaId`, `createdAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_meta_id_rating_idx` ON `tags` (`metaId`, `rating`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tags_meta_id_favorite_idx` ON `tags` (`metaId`, `favorite`);
