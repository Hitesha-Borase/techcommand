-- Ensure quickbooks_connections reflects real unconfigured state
UPDATE quickbooks_connections
SET is_connected = 0,
    realm_id = '',
    last_sync_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE organization_id = 'techflex';
