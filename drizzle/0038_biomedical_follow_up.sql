CREATE TABLE `biomedical_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`work_order_asset_id` text NOT NULL,
	`source_progress_version` integer NOT NULL,
	`stage` text DEFAULT 'needs_verification' NOT NULL,
	`needs_reverification` integer DEFAULT false NOT NULL,
	`part_description` text DEFAULT '' NOT NULL,
	`part_number` text DEFAULT '' NOT NULL,
	`manufacturer_reference` text DEFAULT '' NOT NULL,
	`approval_reference` text DEFAULT '' NOT NULL,
	`vendor_name` text DEFAULT '' NOT NULL,
	`order_reference` text DEFAULT '' NOT NULL,
	`ordered_on` text,
	`received_on` text,
	`repair_work_order_id` text,
	`resolution_note` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`last_request_id` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `admin_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_order_asset_id`) REFERENCES `work_order_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repair_work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_biomedical_follow_up_task` ON `biomedical_follow_ups` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_biomedical_follow_up_queue` ON `biomedical_follow_ups` (`organization_id`,`stage`,`needs_reverification`);--> statement-breakpoint
CREATE INDEX `idx_biomedical_follow_up_asset` ON `biomedical_follow_ups` (`work_order_asset_id`);
--> statement-breakpoint
INSERT INTO `biomedical_follow_ups`
  (`id`,`organization_id`,`task_id`,`work_order_asset_id`,`source_progress_version`,`stage`,`needs_reverification`,`updated_by`)
SELECT t.id,t.organization_id,t.id,wa.id,wa.record_version,'needs_verification',0,wa.updated_by
  FROM `admin_tasks` t
  JOIN `work_order_assets` wa ON wa.id=t.source_record_id AND wa.organization_id=t.organization_id
 WHERE t.source='biomedical_asset_progress'
ON CONFLICT(`task_id`) DO NOTHING;
