CREATE TABLE `academy_report_supervision_reviews` (
	`track` text DEFAULT 'dme_mobility' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`report_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`supervisor_id` text NOT NULL,
	`report_version` integer NOT NULL,
	`evidence_fingerprint` text NOT NULL,
	`notes` text NOT NULL,
	`evidence_snapshot_json` text NOT NULL,
	`signed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `service_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_report_supervision_revision` ON `academy_report_supervision_reviews` (`report_id`,`technician_id`,`report_version`,`supervisor_id`);
--> statement-breakpoint
CREATE INDEX `idx_academy_report_supervision_work` ON `academy_report_supervision_reviews` (`organization_id`,`track`,`work_order_id`);
