CREATE TABLE `asset_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`work_order_id` text,
	`technician_id` text,
	`visit_type` text NOT NULL,
	`visited_at` text NOT NULL,
	`complaint` text,
	`findings` text NOT NULL,
	`work_performed` text NOT NULL,
	`parts_json` text,
	`test_results_json` text,
	`disposition` text NOT NULL,
	`next_action` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_asset_visits_timeline` ON `asset_visits` (`asset_id`,`visited_at`);--> statement-breakpoint
CREATE TABLE `assistant_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`asked_by` text NOT NULL,
	`role` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`sources_json` text,
	`status` text DEFAULT 'answered' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assistant_questions_user` ON `assistant_questions` (`asked_by`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`location_id` text,
	`external_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`address_1` text,
	`address_2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customers_account_status` ON `customers` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_customers_location` ON `customers` (`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_customers_account_external` ON `customers` (`account_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `document_records` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`attachment_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`effective_on` text,
	`expires_on` text,
	`searchable_text` text,
	`status` text DEFAULT 'current' NOT NULL,
	`uploaded_by` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_document_records_scope` ON `document_records` (`scope_type`,`scope_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_document_records_expiry` ON `document_records` (`status`,`expires_on`);--> statement-breakpoint
CREATE TABLE `knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`keywords` text,
	`source_type` text DEFAULT 'internal' NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_entries_category` ON `knowledge_entries` (`organization_id`,`category`,`status`);--> statement-breakpoint
CREATE TABLE `onboarding_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item_key` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_onboarding_user_item` ON `onboarding_progress` (`user_id`,`item_key`);--> statement-breakpoint
ALTER TABLE `account_pricing_policies` ADD `consumer_free_miles` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
CREATE INDEX `idx_work_orders_customer` ON `work_orders` (`customer_id`);