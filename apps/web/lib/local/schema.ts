import * as Schema from 'effect/Schema';

const IntegerText = Schema.String.check(Schema.isMaxLength(20), Schema.isPattern(/^(0|[1-9]\d*)$/));
const DisplayAmount = IntegerText.check(
  Schema.makeFilter((value) =>
    BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
      ? undefined
      : 'Amount exceeds exact display range',
  ),
);
const Timestamp = Schema.String.check(
  Schema.makeFilter((value) =>
    Number.isFinite(Date.parse(value)) ? undefined : 'Invalid payment timestamp',
  ),
);

// The same-origin endpoint projects public metadata; no signer or RPC fields are accepted here.
export const PublicVaultConfigSchema = Schema.String.check(
  Schema.isMaxLength(4096),
  Schema.isPattern(/^brim:v1:[A-Za-z0-9_-]+$/),
);

export const LocalWorkspaceSchema = Schema.Struct({
  status: Schema.Literal('ready'),
  vaultConfig: Schema.optionalKey(Schema.Unknown),
  balanceBaseUnits: DisplayAmount,
  isPaused: Schema.optionalKey(Schema.Boolean),
  chainTimestamp: Schema.optionalKey(IntegerText),
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optionalKey(Schema.String),
      agentKey: Schema.optionalKey(Schema.String),
      isFrozen: Schema.Boolean,
      maxPerTxBaseUnits: DisplayAmount,
      windowLimitBaseUnits: DisplayAmount,
      windowSpentBaseUnits: DisplayAmount,
      minTxInterval: Schema.Number.check(
        Schema.isFinite(),
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0),
      ),
      allowlistEnabled: Schema.Boolean,
      windowStart: Schema.optionalKey(IntegerText),
      windowDuration: Schema.optionalKey(IntegerText),
      allowlist: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ).check(Schema.isMaxLength(100)),
  payments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      merchant: Schema.optionalKey(Schema.String),
      agentName: Schema.optionalKey(Schema.String),
      amountBaseUnits: DisplayAmount,
      signature: Schema.String,
      settledAt: Timestamp,
    }),
  ).check(Schema.isMaxLength(100)),
});

export type LocalWorkspaceResponse = typeof LocalWorkspaceSchema.Type;
