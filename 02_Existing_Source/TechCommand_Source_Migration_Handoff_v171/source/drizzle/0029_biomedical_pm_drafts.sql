CREATE TABLE `biomedical_pm_draft_entries` (
 `id` text PRIMARY KEY NOT NULL,
 `organization_id` text NOT NULL REFERENCES `organizations`(`id`),
 `report_key` text NOT NULL,
 `unit_number` text NOT NULL,
 `fields_json` text NOT NULL,
 `record_version` integer NOT NULL,
 `updated_by` text NOT NULL,
 `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pm_draft_unit` ON `biomedical_pm_draft_entries` (`organization_id`,`report_key`,`unit_number`);
--> statement-breakpoint
CREATE TABLE `biomedical_pm_draft_history` (
 `id` text PRIMARY KEY NOT NULL,
 `organization_id` text NOT NULL REFERENCES `organizations`(`id`),
 `report_key` text NOT NULL,
 `unit_number` text NOT NULL,
 `fields_json` text NOT NULL,
 `record_version` integer NOT NULL,
 `updated_by` text NOT NULL,
 `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pm_draft_history_revision` ON `biomedical_pm_draft_history` (`organization_id`,`report_key`,`unit_number`,`record_version`);
