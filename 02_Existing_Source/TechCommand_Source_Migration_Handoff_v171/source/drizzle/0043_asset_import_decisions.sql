CREATE TABLE `asset_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`import_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`action` text NOT NULL,
	`asset_id` text,
	`expected_asset_version` integer,
	`selected_fields_json` text DEFAULT '[]' NOT NULL,
	`source_json` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`decided_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `data_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_asset_import_rows_import_row` ON `asset_import_rows` (`organization_id`,`import_id`,`source_row`);--> statement-breakpoint
CREATE INDEX `idx_asset_import_rows_asset_created` ON `asset_import_rows` (`organization_id`,`asset_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `data_imports` ADD `created_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `updated_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `skipped_count` integer DEFAULT 0 NOT NULL;