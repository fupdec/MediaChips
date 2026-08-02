ALTER TABLE `media` ADD COLUMN `visualHash` text;--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `visualHashTiles` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_media_type_id_visual_hash_idx` ON `media` (`mediaTypeId`, `visualHash`);
