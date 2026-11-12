ALTER TABLE `route_stops` ADD `planned_departure` text;--> statement-breakpoint
ALTER TABLE `route_stops` ADD `leg_miles` real;--> statement-breakpoint
ALTER TABLE `route_stops` ADD `drive_minutes` integer;--> statement-breakpoint
ALTER TABLE `route_stops` ADD `travel_source` text DEFAULT 'missing' NOT NULL;