CREATE TABLE `asset_label_print_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`label_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`print_number` integer NOT NULL,
	`label_width_mils` integer NOT NULL,
	`label_height_mils` integer NOT NULL,
	`symbology` text DEFAULT 'code128b' NOT NULL,
	`reason` text,
	`asset_version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`printed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`label_id`) REFERENCES `asset_labels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_asset_label_print_request` ON `asset_label_print_events` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_asset_label_print_sequence` ON `asset_label_print_events` (`organization_id`,`label_id`,`print_number`);--> statement-breakpoint
CREATE INDEX `idx_asset_label_print_timeline` ON `asset_label_print_events` (`organization_id`,`asset_id`,`created_at`);