CREATE TABLE `calendar_event_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`user_id` text,
	`calendar_role` text NOT NULL,
	`provider` text DEFAULT 'google' NOT NULL,
	`external_calendar_id` text NOT NULL,
	`external_event_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sync_at` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_calendar_event_links_target` ON `calendar_event_links` (`provider`,`external_calendar_id`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_event_links_work_order` ON `calendar_event_links` (`work_order_id`,`status`);--> statement-breakpoint
CREATE TABLE `calendar_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'google' NOT NULL,
	`external_calendar_id` text,
	`display_name` text,
	`connection_mode` text DEFAULT 'user_oauth' NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`self_manage` integer DEFAULT true NOT NULL,
	`administrators_can_schedule` integer DEFAULT true NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_calendar_profiles_user_provider` ON `calendar_profiles` (`organization_id`,`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_calendar_profiles_status` ON `calendar_profiles` (`organization_id`,`status`);--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_address_1` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_address_2` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_city` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_state` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_postal_code` text;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_latitude` real;--> statement-breakpoint
ALTER TABLE `technicians` ADD `dispatch_longitude` real;