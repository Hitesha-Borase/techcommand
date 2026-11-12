CREATE TABLE `technician_training_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`module_key` text NOT NULL,
	`module_version` integer DEFAULT 1 NOT NULL,
	`answers_json` text NOT NULL,
	`score_percent` integer NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`technician_id`) REFERENCES `technicians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_training_attempts_technician_time` ON `technician_training_attempts` (`technician_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_training_attempts_work_order` ON `technician_training_attempts` (`work_order_id`,`technician_id`);
--> statement-breakpoint
ALTER TABLE `technicians` ADD `training_mode` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `proficiency_level` text DEFAULT 'trainee' NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `guided_jobs_completed` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `qa_pass_streak` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `technicians` ADD `competency_score` integer DEFAULT 0 NOT NULL;
