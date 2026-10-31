ALTER TABLE technicians ADD COLUMN service_disciplines_json TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN service_discipline TEXT;
--> statement-breakpoint
UPDATE accounts SET service_discipline='biomedical' WHERE service_level='Biomedical/PM';
--> statement-breakpoint
