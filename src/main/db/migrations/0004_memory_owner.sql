ALTER TABLE `memories` ADD `owner` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX `memories_owner_idx` ON `memories` (`owner`);--> statement-breakpoint
ALTER TABLE `memory_suggestions` ADD `owner` text DEFAULT 'local' NOT NULL;