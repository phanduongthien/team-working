CREATE TABLE `conversation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text DEFAULT 'local' NOT NULL,
	`name` text NOT NULL,
	`collapsed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_groups_owner_idx` ON `conversation_groups` (`owner`,`created_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `group_id` text REFERENCES conversation_groups(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `parent_id` text REFERENCES conversations(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `forked_from_message_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `title_source` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `suggested_group_id` text REFERENCES conversation_groups(id) ON DELETE SET NULL;