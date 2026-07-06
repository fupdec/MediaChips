CREATE INDEX IF NOT EXISTS `media_media_type_id_filesize_idx` ON `media` (`mediaTypeId`, `filesize`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_content_hash_idx` ON `media` (`mediaTypeId`, `contentHash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_filesize_idx` ON `media` (`filesize`);
