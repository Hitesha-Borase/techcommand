CREATE TABLE `academy_authorizations` (
	`track` text DEFAULT 'biomedical' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`family_id` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`task` text NOT NULL,
	`level` text NOT NULL,
	`signoff_id` text NOT NULL,
	`review_due_on` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`family_id`) REFERENCES `academy_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signoff_id`) REFERENCES `academy_signoffs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_authorization_scope` ON `academy_authorizations` (`organization_id`,`track`,`technician_id`,`family_id`,`manufacturer`,`model`,`task`);--> statement-breakpoint
CREATE TABLE `academy_experience` (
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
	`family_id` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_academy_experience_report_asset` ON `academy_experience` (`report_id`,`asset_id`,`technician_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_experience_source` ON `academy_experience` (`organization_id`,`track`,`source_key`,`technician_id`);--> statement-breakpoint
CREATE INDEX `idx_academy_experience_tech` ON `academy_experience` (`organization_id`,`technician_id`,`task`);--> statement-breakpoint
CREATE TABLE `academy_families` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`name` text NOT NULL,
	`asset_category_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_category_id`) REFERENCES `asset_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_families_track` ON `academy_families` (`organization_id`,`track`);--> statement-breakpoint
CREATE TABLE `academy_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`track` text DEFAULT 'biomedical' NOT NULL,
	`technician_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`current_level` text,
	`target_level` text,
	`specialty` text,
	`evidence` text DEFAULT '' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_profile_track` ON `academy_profiles` (`organization_id`,`technician_id`,`track`);--> statement-breakpoint
CREATE TABLE `academy_signoff_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`signoff_id` text NOT NULL,
	`work_order_id` text,
	`training_record_id` text,
	FOREIGN KEY (`signoff_id`) REFERENCES `academy_signoffs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`training_record_id`) REFERENCES `academy_training_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `academy_signoffs` (
	`track` text DEFAULT 'biomedical' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`family_id` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`task` text NOT NULL,
	`authorization_level` text NOT NULL,
	`result` text NOT NULL,
	`evaluated_on` text NOT NULL,
	`review_due_on` text,
	`demonstration` text NOT NULL,
	`evidence` text NOT NULL,
	`evaluator_name` text NOT NULL,
	`evaluator_qualifications` text NOT NULL,
	`evaluator_user_id` text,
	`recorded_by` text NOT NULL,
	`source` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`family_id`) REFERENCES `academy_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evaluator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_signoffs_tech` ON `academy_signoffs` (`organization_id`,`technician_id`);--> statement-breakpoint
CREATE TABLE `academy_supervision_reviews` (
	`track` text DEFAULT 'biomedical' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`supervisor_id` text NOT NULL,
	`asset_version` integer NOT NULL,
	`notes` text NOT NULL,
	`evidence_snapshot_json` text NOT NULL,
	`signed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_supervision_revision` ON `academy_supervision_reviews` (`work_order_id`,`asset_id`,`technician_id`,`asset_version`,`supervisor_id`);--> statement-breakpoint
CREATE TABLE `academy_training_records` (
	`track` text DEFAULT 'biomedical' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`completed_on` text,
	`minutes` integer,
	`evidence` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`submitted_by` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`feedback` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_training_tech` ON `academy_training_records` (`organization_id`,`technician_id`,`status`);