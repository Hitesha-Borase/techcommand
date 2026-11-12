CREATE TABLE `client_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`work_order_id` text,
	`sender_user_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_client_messages_account_time` ON `client_messages` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_client_messages_work_order_time` ON `client_messages` (`work_order_id`,`created_at`);