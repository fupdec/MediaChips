ALTER TABLE `meta` ADD `pathRegex` text;--> statement-breakpoint
ALTER TABLE `meta` ADD `pathRegexReplace` text DEFAULT '$1';--> statement-breakpoint
ALTER TABLE `meta` ADD `pathRegexCreateTags` integer DEFAULT 1;
