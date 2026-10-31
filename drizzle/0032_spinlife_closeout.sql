CREATE TABLE `spinlife_closeout_drafts` (
	`intake_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`source_version` integer NOT NULL,
	`work_order_id` text,
	`snapshot_json` text,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `work_order_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_spinlife_closeout_work` ON `spinlife_closeout_drafts` (`work_order_id`);