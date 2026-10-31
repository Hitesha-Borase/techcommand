CREATE TABLE `asset_category_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`from_category_id` text,
	`from_revision_id` text,
	`to_category_id` text NOT NULL,
	`to_revision_id` text NOT NULL,
	`reason` text NOT NULL,
	`asset_version` integer NOT NULL,
	`changed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_category_id`) REFERENCES `asset_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_revision_id`) REFERENCES `asset_category_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_category_id`) REFERENCES `asset_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_revision_id`) REFERENCES `asset_category_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_category_event_request` ON `asset_category_events` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_category_event_timeline` ON `asset_category_events` (`organization_id`,`asset_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `asset_category_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`category_id` text NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`risk_class` text NOT NULL,
	`default_pm_interval_months` integer,
	`policy_basis` text NOT NULL,
	`source_reference` text NOT NULL,
	`effective_on` text NOT NULL,
	`request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`published_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_category_revision` ON `asset_category_revisions` (`category_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_category_publish_request` ON `asset_category_revisions` (`organization_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_category_revisions` ON `asset_category_revisions` (`organization_id`,`category_id`,`revision`);--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `draft_name` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `draft_risk_class` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `draft_default_pm_interval_months` integer;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `policy_basis` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `source_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `effective_on` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `current_revision_id` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `last_request_id` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `last_request_fingerprint` text;--> statement-breakpoint
ALTER TABLE `asset_categories` ADD `updated_by` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_category_draft_request` ON `asset_categories` (`organization_id`,`last_request_id`);--> statement-breakpoint
ALTER TABLE `assets` ADD `category_revision_id` text REFERENCES asset_category_revisions(id);