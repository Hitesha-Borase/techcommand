CREATE TABLE asset_labels (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  label_code TEXT NOT NULL CHECK (length(label_code) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('intelliscanner', 'custom', 'legacy')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_by TEXT REFERENCES users(id),
  retired_at TEXT,
  retirement_reason TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_asset_labels_org_code ON asset_labels(organization_id, label_code);
--> statement-breakpoint
CREATE INDEX idx_asset_labels_asset ON asset_labels(organization_id, asset_id, status);
--> statement-breakpoint
CREATE TRIGGER asset_label_identity_insert BEFORE INSERT ON asset_labels
BEGIN
  SELECT RAISE(ABORT, 'asset_label_invalid_owner') WHERE NOT EXISTS (
    SELECT 1 FROM assets WHERE id = NEW.asset_id AND organization_id = NEW.organization_id
  );
  SELECT RAISE(ABORT, 'asset_label_code_conflict') WHERE EXISTS (
    SELECT 1 FROM assets WHERE organization_id = NEW.organization_id AND asset_tag = NEW.label_code AND id != NEW.asset_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER asset_label_identity_immutable BEFORE UPDATE ON asset_labels
WHEN NEW.asset_id != OLD.asset_id OR NEW.organization_id != OLD.organization_id OR NEW.label_code != OLD.label_code
  OR (OLD.status = 'retired' AND NEW.status != 'retired')
BEGIN SELECT RAISE(ABORT, 'asset_label_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER asset_label_keep_history BEFORE DELETE ON asset_labels
BEGIN SELECT RAISE(ABORT, 'asset_label_retire_instead_of_delete'); END;
--> statement-breakpoint
CREATE TRIGGER asset_primary_label_insert BEFORE INSERT ON assets
WHEN EXISTS (SELECT 1 FROM asset_labels WHERE organization_id = NEW.organization_id AND label_code = NEW.asset_tag AND asset_id != NEW.id)
BEGIN SELECT RAISE(ABORT, 'asset_label_code_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER asset_primary_label_update BEFORE UPDATE OF asset_tag, organization_id ON assets
WHEN EXISTS (SELECT 1 FROM asset_labels WHERE organization_id = NEW.organization_id AND label_code = NEW.asset_tag AND asset_id != NEW.id)
BEGIN SELECT RAISE(ABORT, 'asset_label_code_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER asset_primary_label_preserve BEFORE UPDATE OF asset_tag ON assets
WHEN NEW.asset_tag != OLD.asset_tag
BEGIN
  INSERT OR IGNORE INTO asset_labels(id, organization_id, asset_id, label_code, source)
  VALUES(lower(hex(randomblob(16))), OLD.organization_id, OLD.id, OLD.asset_tag, 'legacy');
END;
