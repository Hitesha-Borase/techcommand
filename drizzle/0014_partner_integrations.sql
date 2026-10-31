CREATE TABLE `partner_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_partner_api_key_hash` ON `partner_api_keys` (`key_hash`);
--> statement-breakpoint
CREATE INDEX `idx_partner_api_account_status` ON `partner_api_keys` (`account_id`,`status`);
--> statement-breakpoint
CREATE TABLE `partner_api_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`response_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
	FOREIGN KEY (`api_key_id`) REFERENCES `partner_api_keys`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_partner_api_idempotency` ON `partner_api_requests` (`api_key_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_partner_api_request_time` ON `partner_api_requests` (`account_id`,`created_at`);
