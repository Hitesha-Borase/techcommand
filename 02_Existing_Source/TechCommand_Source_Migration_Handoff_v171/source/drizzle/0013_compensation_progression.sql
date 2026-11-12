ALTER TABLE `technicians` ADD `hire_date` text;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `current_hourly_rate_cents` integer DEFAULT 2500 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `compensation_tier` text DEFAULT 'field_tech_1' NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `protected_rate_cents` integer DEFAULT 2500 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `rate_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `ceu_due_on` text;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `ceu_hours_required` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `ceu_hours_completed` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `last_compensation_review_at` text;
--> statement-breakpoint
CREATE TABLE `technician_compensation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`review_type` text DEFAULT 'progression' NOT NULL,
	`current_rate_cents` integer NOT NULL,
	`recommended_rate_cents` integer NOT NULL,
	`approved_rate_cents` integer,
	`recommended_tier` text NOT NULL,
	`score_snapshot_json` text NOT NULL,
	`margin_snapshot_json` text NOT NULL,
	`status` text DEFAULT 'recommended' NOT NULL,
	`effective_on` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comp_reviews_technician_time` ON `technician_compensation_reviews` (`technician_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_comp_reviews_status` ON `technician_compensation_reviews` (`organization_id`,`status`);
--> statement-breakpoint
CREATE TABLE `technician_mentorships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`mentor_technician_id` text NOT NULL,
	`mentee_technician_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_on` text NOT NULL,
	`solo_qualified_on` text,
	`bonus_rate_bps` integer DEFAULT 100 NOT NULL,
	`bonus_cap_cents` integer DEFAULT 100000 NOT NULL,
	`earned_cents` integer DEFAULT 0 NOT NULL,
	`funded_cents` integer DEFAULT 0 NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`earning_window_ends_on` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mentorship_mentee_status` ON `technician_mentorships` (`mentee_technician_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_mentorship_mentor_status` ON `technician_mentorships` (`mentor_technician_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
