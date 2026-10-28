CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`source_conversation_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `memories_updated_idx` ON `memories` (`updated_at`);--> statement-breakpoint
CREATE TABLE `memory_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`action` text NOT NULL,
	`target_memory_id` text,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `memory_suggestions_status_idx` ON `memory_suggestions` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `memory_extracted_at` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `attachments` text DEFAULT '[]' NOT NULL;