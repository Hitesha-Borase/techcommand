CREATE TABLE `website_intake_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`external_submission_id` text NOT NULL,
	`workflow` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`company_name` text,
	`message` text,
	`source_page_url` text,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`payload_json` text NOT NULL,
	`client_ip_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_website_intake_external` ON `website_intake_submissions` (`organization_id`,`external_submission_id`);
--> statement-breakpoint
CREATE INDEX `idx_website_intake_queue` ON `website_intake_submissions` (`organization_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_website_intake_ip_time` ON `website_intake_submissions` (`client_ip_hash`,`created_at`);
--> statement-breakpoint
CREATE TABLE `marketing_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`website_submission_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'consented' NOT NULL,
	`source` text DEFAULT 'techflex_website' NOT NULL,
	`consent_text` text,
	`consented_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`website_submission_id`) REFERENCES `website_intake_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_marketing_consent_submission` ON `marketing_consents` (`website_submission_id`);
--> statement-breakpoint
CREATE INDEX `idx_marketing_consent_email` ON `marketing_consents` (`organization_id`,`email`);
