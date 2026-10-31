CREATE TABLE `asset_procedure_research` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`generation_id` text NOT NULL,
	`status` text NOT NULL,
	`document_json` text,
	`error_message` text,
	`expires_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `work_order_assets` ADD `procedure_snapshot_json` text;--> statement-breakpoint
ALTER TABLE `work_order_assets` ADD `procedure_answers_json` text;