-- D1 keeps foreign-key enforcement on; defer within this migration transaction.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_academy_experience` (
	`track` text DEFAULT 'biomedical' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`work_order_id` text,
	`report_id` text,
	`asset_id` text,
	`intake_id` text,
	`packet_id` text,
	`source_key` text NOT NULL,
	`family_id` text,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`task` text NOT NULL,
	`service_type` text NOT NULL,
	`supervision` text NOT NULL,
	`supervisor_id` text,
	`authorization_snapshot_json` text NOT NULL,
	`disposition` text NOT NULL,
	`qa_result` text NOT NULL,
	`verified_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `service_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`intake_id`) REFERENCES `work_order_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`packet_id`) REFERENCES `spinlife_packets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`family_id`) REFERENCES `academy_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_academy_experience`("track", "id", "organization_id", "technician_id", "work_order_id", "report_id", "asset_id", "intake_id", "packet_id", "source_key", "family_id", "manufacturer", "model", "task", "service_type", "supervision", "supervisor_id", "authorization_snapshot_json", "disposition", "qa_result", "verified_by", "created_at") SELECT "track", "id", "organization_id", "technician_id", "work_order_id", "report_id", "asset_id", "intake_id", "packet_id", "source_key", "family_id", "manufacturer", "model", "task", "service_type", "supervision", "supervisor_id", "authorization_snapshot_json", "disposition", "qa_result", "verified_by", "created_at" FROM `academy_experience`;--> statement-breakpoint
DROP TABLE `academy_experience`;--> statement-breakpoint
ALTER TABLE `__new_academy_experience` RENAME TO `academy_experience`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_experience_report_asset` ON `academy_experience` (`report_id`,`asset_id`,`technician_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_experience_source` ON `academy_experience` (`organization_id`,`track`,`source_key`,`technician_id`);--> statement-breakpoint
CREATE INDEX `idx_academy_experience_tech` ON `academy_experience` (`organization_id`,`technician_id`,`task`);
