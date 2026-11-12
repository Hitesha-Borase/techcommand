CREATE TABLE `academy_advancement_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`technician_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`policy_version` integer NOT NULL,
	`evidence_hash` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`compensation_status` text DEFAULT 'not_requested' NOT NULL,
	`decision_notes` text DEFAULT '' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`compensation_notes` text DEFAULT '' NOT NULL,
	`compensation_decided_by` text,
	`compensation_decided_at` text,
	`requested_by` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `academy_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`compensation_decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_review_evidence` ON `academy_advancement_reviews` (`organization_id`,`technician_id`,`policy_id`,`policy_version`,`evidence_hash`);--> statement-breakpoint
CREATE INDEX `idx_academy_review_status` ON `academy_advancement_reviews` (`organization_id`,`track`,`status`);--> statement-breakpoint
CREATE TABLE `academy_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`target_level` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`compensation_review` integer DEFAULT 0 NOT NULL,
	`pay_band_min_cents` integer,
	`pay_band_max_cents` integer,
	`notes` text DEFAULT '' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_academy_policy_target` ON `academy_policies` (`organization_id`,`track`,`target_level`);--> statement-breakpoint
CREATE TABLE `academy_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`minimum` integer NOT NULL,
	`match_value` text DEFAULT '' NOT NULL,
	`issuer` text DEFAULT '' NOT NULL,
	`family_id` text,
	`manufacturer` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`task` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `academy_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_academy_requirements_policy` ON `academy_requirements` (`policy_id`,`sort_order`);