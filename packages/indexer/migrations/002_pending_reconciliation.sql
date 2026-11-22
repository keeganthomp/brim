BEGIN;
ALTER TABLE brim_chain_notifications
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_attempts BIGINT NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0);
CREATE INDEX IF NOT EXISTS brim_pending_reconciliation
  ON brim_chain_notifications (last_attempted_at NULLS FIRST, received_at, signature)
  WHERE status = 'pending';
COMMIT;
