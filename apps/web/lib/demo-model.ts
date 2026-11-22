import * as Schema from 'effect/Schema';

const NonNegative = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));

export const AgentSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  role: Schema.String,
  spent: NonNegative,
  cap: NonNegative,
  budget: NonNegative,
  requests: NonNegative,
  frozen: Schema.Boolean,
  allowlistEnabled: Schema.Boolean,
  recipients: Schema.String,
  icon: Schema.Literals(['research', 'data', 'code']),
});

export const ActivitySchema = Schema.Struct({
  id: Schema.String,
  merchant: Schema.String,
  agent: Schema.String,
  amount: Schema.Number.check(Schema.isFinite()),
  status: Schema.Literals(['settled', 'blocked', 'deposit', 'withdrawal']),
  reason: Schema.optionalKey(Schema.String),
  signature: Schema.optionalKey(Schema.String),
  time: Schema.String,
});

export const DemoStateSchema = Schema.Struct({
  balance: NonNegative,
  agents: Schema.mutable(Schema.Array(AgentSchema)).check(Schema.isMaxLength(100)),
  activity: Schema.mutable(Schema.Array(ActivitySchema)).check(Schema.isMaxLength(100)),
});

export const DemoStateJson = Schema.fromJsonString(DemoStateSchema);
export type Agent = typeof AgentSchema.Type;
export type Activity = typeof ActivitySchema.Type;
export type DemoState = typeof DemoStateSchema.Type;
