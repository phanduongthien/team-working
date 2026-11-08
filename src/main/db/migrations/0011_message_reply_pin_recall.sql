ALTER TABLE `messages` ADD `reply_to_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `recalled_at` integer;