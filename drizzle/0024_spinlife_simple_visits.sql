CREATE TABLE `spinlife_packets` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`source_version` integer NOT NULL,
	`attachment_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `work_order_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_spinlife_packets_version` ON `spinlife_packets` (`intake_id`,`source_version`);--> statement-breakpoint
CREATE TABLE `spinlife_visits` (
	`intake_id` text PRIMARY KEY NOT NULL,
	`technician_id` text,
	`technician_pay_cents` integer,
	`scheduled_start` text,
	`started_at` text,
	`documented_at` text,
	`visit_json` text DEFAULT '{}' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`last_mutation_id` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `work_order_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_spinlife_visits_technician` ON `spinlife_visits` (`technician_id`);