CREATE TABLE `academy_field_modes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`work_order_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`mode` text NOT NULL,
	`authorization_snapshot_json` text NOT NULL,
	`last_request_id` text NOT NULL,
	`selected_by` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_field_mode_work` ON `academy_field_modes` (`organization_id`,`work_order_id`,`technician_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_field_mode_request` ON `academy_field_modes` (`organization_id`,`last_request_id`);--> statement-breakpoint
CREATE INDEX `idx_academy_field_mode_tech` ON `academy_field_modes` (`organization_id`,`track`,`technician_id`,`updated_at`);