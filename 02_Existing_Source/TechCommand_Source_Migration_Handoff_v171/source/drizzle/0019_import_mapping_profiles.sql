CREATE TABLE `import_mapping_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`profile_name` text COLLATE NOCASE NOT NULL,
	`import_type` text NOT NULL,
	`source_headers_json` text NOT NULL,
	`mapping_json` text NOT NULL,
	`status` text DEFAULT 'saved_plan' NOT NULL,
	`exchange_verified` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_import_mapping_profiles_org_type_name` ON `import_mapping_profiles` (`organization_id`,`import_type`,`profile_name`);
--> statement-breakpoint
CREATE INDEX `idx_import_mapping_profiles_org_type` ON `import_mapping_profiles` (`organization_id`,`import_type`,`updated_at`);
