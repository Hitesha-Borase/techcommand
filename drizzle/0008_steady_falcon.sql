CREATE TABLE `customer_feedback_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`customer_id` text,
	`channel` text NOT NULL,
	`destination` text,
	`campaign_name` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`message_subject` text,
	`message_body` text NOT NULL,
	`review_url` text,
	`scheduled_for` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`external_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_feedback_work_order_channel` ON `customer_feedback_requests` (`work_order_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_feedback_status_schedule` ON `customer_feedback_requests` (`organization_id`,`status`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`amount_cents` integer NOT NULL,
	`received_on` text NOT NULL,
	`reference` text,
	`payload_json` text,
	`recorded_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_invoice_payments_provider_external` ON `invoice_payments` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_payments_invoice` ON `invoice_payments` (`invoice_id`,`received_on`);--> statement-breakpoint
CREATE TABLE `pay_stub_items` (
	`id` text PRIMARY KEY NOT NULL,
	`pay_stub_id` text NOT NULL,
	`payout_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`invoice_id` text,
	`work_order_number` text NOT NULL,
	`account_name` text NOT NULL,
	`service_date` text,
	`gross_revenue_cents` integer NOT NULL,
	`payout_cents` integer NOT NULL,
	`collection_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pay_stub_id`) REFERENCES `pay_stubs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payout_id`) REFERENCES `technician_payouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pay_stub_items_payout` ON `pay_stub_items` (`payout_id`);--> statement-breakpoint
CREATE INDEX `idx_pay_stub_items_stub` ON `pay_stub_items` (`pay_stub_id`);--> statement-breakpoint
CREATE TABLE `pay_stubs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	`job_count` integer DEFAULT 0 NOT NULL,
	`gross_revenue_cents` integer DEFAULT 0 NOT NULL,
	`gross_pay_cents` integer DEFAULT 0 NOT NULL,
	`pdf_attachment_id` text,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text,
	`paid_at` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pay_stubs_technician_period` ON `pay_stubs` (`technician_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE INDEX `idx_pay_stubs_status_schedule` ON `pay_stubs` (`organization_id`,`status`,`scheduled_for`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `external_provider` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `external_status` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `last_synced_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paid_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payment_reference` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_invoices_external` ON `invoices` (`external_provider`,`external_id`);--> statement-breakpoint
ALTER TABLE `service_reports` ADD `customer_complaint` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `equipment_type` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `manufacturer` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `model` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `serial_number` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `diagnostic_steps_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `test_results` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `parts_used_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `asset_disposition` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `signature_attachment_id` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `report_pdf_attachment_id` text;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `qa_notes` text;--> statement-breakpoint
ALTER TABLE `technician_payouts` ADD `collection_status` text DEFAULT 'awaiting_customer_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE `technician_payouts` ADD `funds_received_at` text;