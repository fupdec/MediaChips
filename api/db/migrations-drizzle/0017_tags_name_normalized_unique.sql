CREATE UNIQUE INDEX IF NOT EXISTS `tags_name_normalized_unique` ON `tags` (lower(trim(`name`)));
