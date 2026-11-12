CREATE TABLE `technical_document_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_revision` text DEFAULT '' NOT NULL,
	`document_snapshot_json` text NOT NULL,
	`effective_on` text,
	`verified_on` text NOT NULL,
	`applicability` text NOT NULL,
	`limitations_json` text DEFAULT '[]' NOT NULL,
	`review_basis` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `technical_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_document_revision` ON `technical_document_revisions` (`document_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_technical_revisions_document` ON `technical_document_revisions` (`document_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `technical_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`track` text NOT NULL,
	`family_id` text,
	`manufacturer` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`serial_range` text DEFAULT '' NOT NULL,
	`document_type` text DEFAULT 'service_manual' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`current_revision_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_technical_documents_lookup` ON `technical_documents` (`organization_id`,`track`,`manufacturer`,`model`,`status`);--> statement-breakpoint
CREATE TABLE `technical_measurement_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`step_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`expected_min` text,
	`expected_max` text,
	`expected_text` text,
	`conditions` text DEFAULT '' NOT NULL,
	`source_locator` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `technical_workflow_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_measurement_step_name` ON `technical_measurement_requirements` (`template_id`,`step_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_technical_measurements_template` ON `technical_measurement_requirements` (`template_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `technical_workflow_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`service_type` text NOT NULL,
	`steps_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `technical_document_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_technical_workflow_revision_service` ON `technical_workflow_templates` (`revision_id`,`service_type`);