ALTER TABLE `document_records` ADD `deleted_at` text;
CREATE INDEX `idx_document_records_trash_retention` ON `document_records` (`status`,`deleted_at`);
