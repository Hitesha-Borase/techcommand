CREATE TABLE `multipart_upload_sessions` (
	`upload_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`category` text NOT NULL,
	`storage_key` text NOT NULL,
	`source_file_name` text NOT NULL,
	`safe_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`initiated_by` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`completed_at` text,
	`ended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_multipart_upload_storage_key` ON `multipart_upload_sessions` (`storage_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_multipart_upload_active_attachment` ON `multipart_upload_sessions` (`organization_id`,`attachment_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE INDEX `idx_multipart_upload_attachment` ON `multipart_upload_sessions` (`organization_id`,`attachment_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_multipart_upload_expiry` ON `multipart_upload_sessions` (`status`,`expires_at`);
