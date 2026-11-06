ALTER TABLE `messages` ADD `reactions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `media` text;