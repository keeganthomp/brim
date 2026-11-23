import { Schema } from 'effect';
import { address } from '@solana/kit';
import { NETWORKS } from './constants.js';

export const AddressSchema = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      address(value);
      return true;
    } catch {
      return false;
    }
  }),
);
export const NetworkSchema = Schema.Literals(
  Object.keys(NETWORKS) as [keyof typeof NETWORKS, keyof typeof NETWORKS],
);
export const FeePayersSchema = Schema.Array(AddressSchema).check(
  Schema.isBetweenLength(1, 16),
  Schema.makeFilter((values) => new Set(values).size === values.length),
);
const RoutingFields = {
  vaultAddress: AddressSchema,
  programAddress: AddressSchema,
  network: NetworkSchema,
};
export const VaultConfigDetailsSchema = Schema.Struct({
  ...RoutingFields,
  facilitatorFeePayers: FeePayersSchema,
});
export const VaultConfigPayloadSchema = Schema.Struct({
  version: Schema.Literal(1),
  ...RoutingFields,
  facilitatorFeePayers: FeePayersSchema,
});
export const AtomicAmountSchema = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/));
const KeySchema = Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Uint8Array]);
const OptionalFunctionSchema = Schema.optional(
  Schema.Unknown.check(Schema.makeFilter((value) => typeof value === 'function')),
);
export const AdvancedConfigSchema = Schema.Struct({
  ...RoutingFields,
  agentSecretKey: KeySchema,
  rpcUrl: Schema.String,
  facilitator: Schema.Struct({
    mode: Schema.Literal('smart-wallet-exact'),
    feePayers: FeePayersSchema,
  }),
  maxPaymentAmount: Schema.optional(
    Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 1n, maximum: 0xffff_ffff_ffff_ffffn })),
  ),
  fetch: OptionalFunctionSchema,
  onEvent: OptionalFunctionSchema,
});
export const PaymentBoundarySchema = Schema.Struct({
  scheme: Schema.String,
  network: Schema.String,
  asset: AddressSchema,
  amount: AtomicAmountSchema,
  payTo: AddressSchema,
  maxTimeoutSeconds: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 300 }),
  ),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
