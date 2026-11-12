CREATE TABLE `account_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`location_id` text,
	`access_role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_account_access_scope` ON `account_access` (`user_id`,`account_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `idx_account_access_user` ON `account_access` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`floor` text,
	`room` text,
	`cost_center` text,
	`status` text DEFAULT 'active' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_departments_location_name` ON `departments` (`location_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_departments_location_status` ON `departments` (`location_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`source_type` text,
	`source_id` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`work_order_id` text,
	`estimate_id` text,
	`invoice_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issued_on` text,
	`due_on` text,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`pdf_attachment_id` text,
	`template_version` text DEFAULT 'techflex-blue-v1' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_invoices_number` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_account_status` ON `invoices` (`account_id`,`status`,`due_on`);--> statement-breakpoint
CREATE TABLE `service_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`rate_card_id` text,
	`contract_number` text,
	`name` text NOT NULL,
	`contract_type` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`auto_renew` integer DEFAULT false NOT NULL,
	`service_level_json` text,
	`covered_services_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_contracts_account_status` ON `service_contracts` (`account_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_contracts_account_number` ON `service_contracts` (`account_id`,`contract_number`);--> statement-breakpoint
CREATE TABLE `technician_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`technician_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`invoice_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`basis_type` text NOT NULL,
	`basis_rate` real NOT NULL,
	`gross_revenue_cents` integer DEFAULT 0 NOT NULL,
	`payout_cents` integer DEFAULT 0 NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_payouts_tech_work_order` ON `technician_payouts` (`technician_id`,`work_order_id`);--> statement-breakpoint
CREATE INDEX `idx_payouts_status` ON `technician_payouts` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `department_id` text REFERENCES departments(id);--> statement-breakpoint
ALTER TABLE `assets` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `routes` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `technicians` ADD `record_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `record_version` integer DEFAULT 1 NOT NULL;