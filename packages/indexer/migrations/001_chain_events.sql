BEGIN;
CREATE TABLE IF NOT EXISTS brim_chain_notifications (
  signature TEXT PRIMARY KEY CHECK (signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed', 'unrelated')),
  slot BIGINT CHECK (slot >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CHECK ((status = 'pending' AND verified_at IS NULL) OR (status <> 'pending' AND verified_at IS NOT NULL AND slot IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS brim_payments (
  signature TEXT NOT NULL REFERENCES brim_chain_notifications(signature),
  event_index SMALLINT NOT NULL CHECK (event_index BETWEEN 0 AND 63),
  vault TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_base_units NUMERIC(20, 0) NOT NULL CHECK (amount_base_units > 0 AND amount_base_units <= 18446744073709551615),
  chain_timestamp BIGINT NOT NULL,
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS brim_payments_vault_feed ON brim_payments (vault, chain_timestamp DESC);
CREATE INDEX IF NOT EXISTS brim_pending_notifications ON brim_chain_notifications (received_at) WHERE status = 'pending';
COMMIT;
