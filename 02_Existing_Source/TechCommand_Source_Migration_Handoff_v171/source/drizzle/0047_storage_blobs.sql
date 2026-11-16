CREATE TABLE IF NOT EXISTS `storage_blobs` (
	`storage_key` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`storage_key`, `chunk_index`)
);
