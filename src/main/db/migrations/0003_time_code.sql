CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`project_name` text,
	`kind` text DEFAULT 'timer' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `time_entries_started_idx` ON `time_entries` (`started_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `code_write` integer DEFAULT false NOT NULL;