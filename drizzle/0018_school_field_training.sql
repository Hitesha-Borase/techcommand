
CREATE TABLE `training_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`placement_id` text NOT NULL,
	`work_order_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`data_json` text NOT NULL,
	`submitted_by` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`placement_id`) REFERENCES `training_placements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE INDEX `idx_training_logs_placement` ON `training_logs` (`organization_id`,`placement_id`);--> statement-breakpoint

CREATE TABLE `training_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`school_id` text NOT NULL,
	`student_name` text NOT NULL,
	`technician_id` text,
	`mentor_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`data_json` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `training_schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE INDEX `idx_training_placements_school` ON `training_placements` (`organization_id`,`school_id`);--> statement-breakpoint

CREATE INDEX `idx_training_placements_tech` ON `training_placements` (`technician_id`,`status`);--> statement-breakpoint

CREATE TABLE `training_schools` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`coordinator_email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`data_json` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE INDEX `idx_training_schools_email` ON `training_schools` (`organization_id`,`coordinator_email`,`active`);