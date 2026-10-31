CREATE TABLE `work_order_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`notes` text,
	`findings` text,
	`work_performed` text,
	`test_results` text,
	`disposition` text,
	`not_applicable_reason` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_work_order_assets_scope` ON `work_order_assets` (`work_order_id`,`asset_id`);
--> statement-breakpoint
CREATE INDEX `idx_work_order_assets_progress` ON `work_order_assets` (`work_order_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_work_order_assets_asset` ON `work_order_assets` (`asset_id`,`updated_at`);
