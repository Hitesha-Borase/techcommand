-- Owner-requested correction: the roster's Joel Johnston was uploaded as an employee.
-- Exact technician ID from the live creation audit; no name-based bulk update.
INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
SELECT 'correction_joel_contractor_20260908','techflex',NULL,'technician.employment_corrected','technician',id,
 json_object('employmentType',employment_type,'payoutType',payout_type,'payoutRate',payout_rate,'hourlyRateCents',current_hourly_rate_cents,'protectedRateCents',protected_rate_cents,'compensationTier',compensation_tier),
 json_object('employmentType','contractor','payoutType','percentage','payoutRate',0.55,'hourlyRateCents',0,'protectedRateCents',0,'compensationTier','contractor','source','Owner request in TechCommand workspace, 2026-09-08')
FROM technicians WHERE id='c93a1294-a028-4225-99c2-fe0cf94524b3' AND organization_id='techflex' AND employment_type='employee'
AND user_id IN (SELECT id FROM users WHERE lower(email)='joeljohnston1986@gmail.com')
AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE id='correction_joel_contractor_20260908');
--> statement-breakpoint
UPDATE technicians SET employment_type='contractor',payout_type='percentage',payout_rate=0.55,current_hourly_rate_cents=0,protected_rate_cents=0,compensation_tier='contractor',record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
WHERE id='c93a1294-a028-4225-99c2-fe0cf94524b3' AND organization_id='techflex' AND employment_type='employee'
AND user_id IN (SELECT id FROM users WHERE lower(email)='joeljohnston1986@gmail.com')
AND EXISTS (SELECT 1 FROM audit_logs WHERE id='correction_joel_contractor_20260908');
