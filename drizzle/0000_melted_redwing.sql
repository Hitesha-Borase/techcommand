CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`account_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`billing_email` text,
	`payment_terms_days` integer DEFAULT 30 NOT NULL,
	`service_level` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_org_status` ON `accounts` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_accounts_org_external` ON `accounts` (`organization_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `asset_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`risk_class` text NOT NULL,
	`default_pm_interval_months` integer,
	`default_procedure_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_asset_categories_org_name` ON `asset_categories` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`location_id` text NOT NULL,
	`category_id` text,
	`asset_tag` text NOT NULL,
	`customer_asset_id` text,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text,
	`description` text,
	`department` text,
	`risk_class` text NOT NULL,
	`status` text DEFAULT 'in_service' NOT NULL,
	`ownership_type` text,
	`in_service_date` text,
	`warranty_expires_on` text,
	`last_pm_on` text,
	`next_pm_due_on` text,
	`pm_interval_months` integer,
	`qr_code_value` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_assets_org_tag` ON `assets` (`organization_id`,`asset_tag`);--> statement-breakpoint
CREATE INDEX `idx_assets_location_status` ON `assets` (`location_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assets_pm_due` ON `assets` (`status`,`next_pm_due_on`);--> statement-breakpoint
CREATE INDEX `idx_assets_serial` ON `assets` (`manufacturer`,`serial_number`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum` text,
	`category` text DEFAULT 'general' NOT NULL,
	`uploaded_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_attachments_storage_key` ON `attachments` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_attachments_entity` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`request_id` text,
	`device_id` text,
	`ip_hash` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity_timeline` ON `audit_logs` (`entity_type`,`entity_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor_timeline` ON `audit_logs` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`title` text,
	`email` text,
	`phone` text,
	`contact_type` text DEFAULT 'general' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_contacts_account` ON `contacts` (`account_id`);--> statement-breakpoint
CREATE TABLE `estimate_items` (
	`id` text PRIMARY KEY NOT NULL,
	`estimate_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`rule_id` text,
	`metadata_json` text,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `pricing_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_estimate_items_estimate` ON `estimate_items` (`estimate_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text,
	`account_id` text NOT NULL,
	`rate_card_id` text,
	`estimate_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`estimated_cost_cents` integer DEFAULT 0 NOT NULL,
	`gross_margin_basis_points` integer DEFAULT 0 NOT NULL,
	`pricing_snapshot_json` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_estimates_number` ON `estimates` (`estimate_number`);--> statement-breakpoint
CREATE INDEX `idx_estimates_account_status` ON `estimates` (`account_id`,`status`);--> statement-breakpoint
CREATE TABLE `integration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_key` text NOT NULL,
	`external_event_id` text,
	`direction` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`payload_json` text NOT NULL,
	`error_message` text,
	`next_attempt_at` text,
	`processed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_integration_external_event` ON `integration_events` (`integration_key`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_events_queue` ON `integration_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`location_type` text,
	`department` text,
	`status` text DEFAULT 'active' NOT NULL,
	`address_1` text NOT NULL,
	`address_2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postal_code` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`latitude` real,
	`longitude` real,
	`access_instructions` text,
	`service_window_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_locations_account_status` ON `locations` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_locations_region` ON `locations` (`state`,`postal_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_locations_account_external` ON `locations` (`account_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_memberships_org_user_role` ON `memberships` (`organization_id`,`user_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`display_name` text NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`module` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pm_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`procedure_version` text NOT NULL,
	`interval_months` integer NOT NULL,
	`next_due_on` text NOT NULL,
	`grace_days` integer DEFAULT 0 NOT NULL,
	`checklist_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pm_plans_due` ON `pm_plans` (`status`,`next_due_on`);--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rate_card_id` text NOT NULL,
	`service_type` text NOT NULL,
	`rule_name` text NOT NULL,
	`rule_type` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`condition_json` text,
	`calculation_json` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_rules_card_service` ON `pricing_rules` (`rate_card_id`,`service_type`,`is_active`);--> statement-breakpoint
CREATE TABLE `rate_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`target_gross_margin` real DEFAULT 0.4 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_rate_cards_account_name_version` ON `rate_cards` (`account_id`,`name`,`version`);--> statement-breakpoint
CREATE INDEX `idx_rate_cards_active` ON `rate_cards` (`account_id`,`status`,`effective_from`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_role_permissions_pair` ON `role_permissions` (`role_id`,`permission_key`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_roles_org_name` ON `roles` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `route_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`work_order_id` text,
	`stop_order` integer NOT NULL,
	`stop_type` text DEFAULT 'service' NOT NULL,
	`address_json` text NOT NULL,
	`time_window_start` text,
	`time_window_end` text,
	`planned_arrival` text,
	`actual_arrival` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_route_stops_order` ON `route_stops` (`route_id`,`stop_order`);--> statement-breakpoint
CREATE INDEX `idx_route_stops_work_order` ON `route_stops` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`route_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`start_location_json` text NOT NULL,
	`end_location_json` text,
	`total_miles` real,
	`total_drive_minutes` integer,
	`optimization_provider` text,
	`optimization_snapshot_json` text,
	`optimized_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_routes_tech_date` ON `routes` (`technician_id`,`route_date`);--> statement-breakpoint
CREATE INDEX `idx_routes_org_date` ON `routes` (`organization_id`,`route_date`);--> statement-breakpoint
CREATE TABLE `service_regions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`region_type` text NOT NULL,
	`definition_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_regions_org_status` ON `service_regions` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`report_version` integer DEFAULT 1 NOT NULL,
	`findings` text,
	`work_performed` text,
	`recommendation` text,
	`checklist_json` text,
	`customer_signature_name` text,
	`customer_signed_at` text,
	`submitted_at` text,
	`qa_status` text DEFAULT 'draft' NOT NULL,
	`qa_reviewed_by` text,
	`qa_reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`qa_reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_service_reports_qa` ON `service_reports` (`qa_status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`client_mutation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`base_version` integer,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`conflict_json` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_sync_client_mutation` ON `sync_mutations` (`client_mutation_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_device_status` ON `sync_mutations` (`device_id`,`status`,`received_at`);--> statement-breakpoint
CREATE TABLE `technician_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`technician_id` text NOT NULL,
	`credential_type` text NOT NULL,
	`credential_number` text,
	`issuer` text,
	`issued_on` text,
	`expires_on` text,
	`status` text DEFAULT 'current' NOT NULL,
	`attachment_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_credentials_technician` ON `technician_credentials` (`technician_id`);--> statement-breakpoint
CREATE INDEX `idx_credentials_expiration` ON `technician_credentials` (`status`,`expires_on`);--> statement-breakpoint
CREATE TABLE `technician_regions` (
	`technician_id` text NOT NULL,
	`service_region_id` text NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_region_id`) REFERENCES `service_regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_technician_regions_pair` ON `technician_regions` (`technician_id`,`service_region_id`);--> statement-breakpoint
CREATE TABLE `technicians` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`technician_code` text NOT NULL,
	`employment_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`phone` text,
	`home_postal_code` text,
	`home_latitude` real,
	`home_longitude` real,
	`max_radius_miles` integer DEFAULT 200 NOT NULL,
	`payout_type` text DEFAULT 'percentage' NOT NULL,
	`payout_rate` real DEFAULT 0.55 NOT NULL,
	`skills_json` text,
	`availability_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_technicians_org_code` ON `technicians` (`organization_id`,`technician_code`);--> statement-breakpoint
CREATE INDEX `idx_technicians_org_status` ON `technicians` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_subject` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_users_auth_subject` ON `users` (`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `work_order_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`role` text DEFAULT 'primary' NOT NULL,
	`status` text DEFAULT 'offered' NOT NULL,
	`offered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`responded_at` text,
	`dispatched_at` text,
	`arrived_at` text,
	`departed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_work_order_assignments_pair` ON `work_order_assignments` (`work_order_id`,`technician_id`);--> statement-breakpoint
CREATE INDEX `idx_assignments_technician_status` ON `work_order_assignments` (`technician_id`,`status`);--> statement-breakpoint
CREATE TABLE `work_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_user_id` text,
	`source` text DEFAULT 'portal' NOT NULL,
	`payload_json` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_order_events_timeline` ON `work_order_events` (`work_order_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`location_id` text NOT NULL,
	`asset_id` text,
	`external_source` text,
	`external_id` text,
	`service_type` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`summary` text NOT NULL,
	`description` text,
	`required_skills_json` text,
	`required_technician_count` integer DEFAULT 1 NOT NULL,
	`product_weight_lb` real,
	`stairs_count` integer DEFAULT 0 NOT NULL,
	`scheduled_start` text,
	`scheduled_end` text,
	`service_window_json` text,
	`accepted_price_cents` integer,
	`estimated_cost_cents` integer,
	`gross_margin_basis_points` integer,
	`opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`invoice_ready_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_work_orders_source_external` ON `work_orders` (`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_org_status` ON `work_orders` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_account_status` ON `work_orders` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_schedule` ON `work_orders` (`status`,`scheduled_start`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_location` ON `work_orders` (`location_id`);