ALTER TABLE `meta` ADD `pathRegexEnabled` integer DEFAULT 0;--> statement-breakpoint
UPDATE `meta` SET `pathRegexEnabled` = 1 WHERE `pathRegex` IS NOT NULL AND TRIM(`pathRegex`) != '';
