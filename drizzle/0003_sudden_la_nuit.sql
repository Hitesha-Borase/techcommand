CREATE TABLE `account_pricing_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text DEFAULT 'Primary account rules' NOT NULL,
	`target_gross_margin_bps` integer DEFAULT 4000 NOT NULL,
	`mileage_rate_cents` integer DEFAULT 77 NOT NULL,
	`consumer_mileage_rate_cents` integer DEFAULT 67 NOT NULL,
	`fuel_per_drive_hour_cents` integer DEFAULT 1000 NOT NULL,
	`technician_hourly_cost_cents` integer DEFAULT 2500 NOT NULL,
	`operating_allowance_per_hour_cents` integer DEFAULT 1000 NOT NULL,
	`additional_technician_fee_cents` integer DEFAULT 6500 NOT NULL,
	`stairs_fee_cents` integer DEFAULT 10000 NOT NULL,
	`pricing_rules_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_account_pricing_policies_account` ON `account_pricing_policies` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_account_pricing_policies_status` ON `account_pricing_policies` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `equipment_knowledge_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model_pattern` text,
	`equipment_type` text NOT NULL,
	`title` text NOT NULL,
	`symptom_keywords_json` text,
	`diagnostic_questions_json` text NOT NULL,
	`diagnostic_steps_json` text NOT NULL,
	`support_phone` text,
	`support_email` text,
	`support_hours` text,
	`source_url` text,
	`source_verified_on` text,
	`status` text DEFAULT 'active' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_equipment_knowledge_lookup` ON `equipment_knowledge_articles` (`organization_id`,`manufacturer`,`equipment_type`,`status`);