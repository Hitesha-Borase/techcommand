CREATE TABLE `admin_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text,
	`work_order_id` text,
	`assigned_user_id` text,
	`assigned_role` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_record_id` text,
	`due_at` text,
	`completed_at` text,
	`completed_by` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_admin_tasks_queue` ON `admin_tasks` (`organization_id`,`status`,`priority`,`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_admin_tasks_source_record` ON `admin_tasks` (`source`,`source_record_id`);--> statement-breakpoint
CREATE TABLE `data_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`import_type` text NOT NULL,
	`source` text NOT NULL,
	`file_name` text,
	`source_document_id` text,
	`status` text DEFAULT 'received' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`mapping_json` text,
	`error_json` text,
	`imported_by` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`imported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_data_imports_org_created` ON `data_imports` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_data_imports_status` ON `data_imports` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_key` text NOT NULL,
	`provider` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`connection_mode` text NOT NULL,
	`config_json` text,
	`last_sync_at` text,
	`last_success_at` text,
	`last_error` text,
	`sync_cursor` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_integration_connections_org_key` ON `integration_connections` (`organization_id`,`integration_key`);--> statement-breakpoint
CREATE INDEX `idx_integration_connections_status` ON `integration_connections` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `technician_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`technician_id` text NOT NULL,
	`work_order_id` text,
	`entry_date` text NOT NULL,
	`entry_type` text NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`miles` real DEFAULT 0 NOT NULL,
	`notes` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_time_entries_technician_date` ON `technician_time_entries` (`technician_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_status` ON `technician_time_entries` (`status`,`entry_date`);