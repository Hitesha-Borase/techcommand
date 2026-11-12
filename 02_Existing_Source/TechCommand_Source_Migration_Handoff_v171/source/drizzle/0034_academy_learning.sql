CREATE TABLE `academy_course_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`published_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `academy_courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_course_revision` ON `academy_course_revisions` (`course_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_academy_course_revisions_track` ON `academy_course_revisions` (`organization_id`,`track`);--> statement-breakpoint
CREATE TABLE `academy_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'foundations' NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`credential` text DEFAULT '' NOT NULL,
	`specialty` text DEFAULT '' NOT NULL,
	`difficulty` text DEFAULT 'introductory' NOT NULL,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_revision_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_courses_catalog` ON `academy_courses` (`organization_id`,`track`,`status`,`category`);--> statement-breakpoint
CREATE TABLE `academy_education_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`technician_id` text NOT NULL,
	`course` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`official_url` text DEFAULT '' NOT NULL,
	`cost_cents` integer,
	`requested_company_cents` integer,
	`approved_company_cents` integer,
	`employee_remainder_cents` integer,
	`agreement_reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`decision_notes` text DEFAULT '' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`training_record_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`training_record_id`) REFERENCES `academy_training_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_education_requests` ON `academy_education_requests` (`organization_id`,`track`,`technician_id`,`status`);--> statement-breakpoint
CREATE TABLE `academy_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`technician_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`progress_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`training_record_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`assigned_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `academy_course_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`training_record_id`) REFERENCES `academy_training_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_enrollment_revision` ON `academy_enrollments` (`organization_id`,`technician_id`,`revision_id`);--> statement-breakpoint
CREATE INDEX `idx_academy_enrollment_tech` ON `academy_enrollments` (`organization_id`,`track`,`technician_id`,`status`);