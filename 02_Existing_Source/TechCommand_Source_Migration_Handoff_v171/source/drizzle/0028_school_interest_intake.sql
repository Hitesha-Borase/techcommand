CREATE TABLE `school_interest_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`institution_slug` text NOT NULL,
	`institution_name` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`program` text,
	`graduation_date` text,
	`availability` text NOT NULL,
	`transportation` text NOT NULL,
	`tools` text NOT NULL,
	`resume_key` text,
	`resume_name` text,
	`resume_content_type` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_school_interest_institution_created` ON `school_interest_submissions` (`organization_id`,`institution_slug`,`created_at`);
