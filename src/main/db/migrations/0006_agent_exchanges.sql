CREATE TABLE `agent_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`tool` text NOT NULL,
	`input` text DEFAULT '' NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `agent_exchanges_created_idx` ON `agent_exchanges` (`created_at`);--> statement-breakpoint
CREATE INDEX `agent_exchanges_client_idx` ON `agent_exchanges` (`client_id`);