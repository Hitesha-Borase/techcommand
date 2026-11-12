CREATE TABLE `academy_quality_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text DEFAULT 'dme_mobility' NOT NULL,
	`technician_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`report_id` text NOT NULL,
	`report_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`diagnostic_outcome` text NOT NULL,
	`first_repair_outcome` text NOT NULL,
	`callback_outcome` text NOT NULL,
	`documentation_outcome` text NOT NULL,
	`reviewed_through_on` text NOT NULL,
	`evidence` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`previous_review_id` text,
	`reviewed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `service_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_quality_revision` ON `academy_quality_reviews` (`report_id`,`technician_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_academy_quality_tech` ON `academy_quality_reviews` (`organization_id`,`track`,`technician_id`,`created_at`);