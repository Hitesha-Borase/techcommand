CREATE TABLE `asset_placement_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`from_account_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`from_department_id` text,
	`from_room` text,
	`from_configuration` text,
	`from_software_version` text,
	`to_account_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`to_department_id` text,
	`to_room` text,
	`to_configuration` text,
	`to_software_version` text,
	`reason` text NOT NULL,
	`asset_version` integer NOT NULL,
	`changed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_placement_request` ON `asset_placement_events` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_placement_timeline` ON `asset_placement_events` (`organization_id`,`asset_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assets` ADD `room` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `configuration` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `software_version` text;