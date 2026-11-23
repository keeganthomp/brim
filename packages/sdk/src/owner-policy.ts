import { AccountRole, address, getAddressEncoder, type Instruction } from '@solana/kit';
import { Effect, Schema } from 'effect';
import { findBrimPolicyAddress } from './accounts.js';
import { AddressSchema } from './schemas.js';
import { BrimPolicyViolationError } from './errors.js';
import { fromPromise } from './effects.js';

export interface OwnerPolicyLimits {
  maxPerTx: bigint;
  windowLimit: bigint;
  windowDuration: bigint;
  minTxInterval: bigint;
  allowlistEnabled: boolean;
  allowlist: readonly string[];
}
export interface UpsertAgentPolicyInput {
  programAddress: string;
  vaultAddress: string;
  ownerAddress: string;
  payerAddress?: string;
  agentKey: string;
  limits: OwnerPolicyLimits;
}
const SYSTEM = '11111111111111111111111111111111';
const MAX_I64 = 0x7fff_ffff_ffff_ffffn;
const U64 = Schema.BigInt.check(
  Schema.isBetweenBigInt({ minimum: 1n, maximum: 0xffff_ffff_ffff_ffffn }),
);
const Limits = Schema.Struct({
  maxPerTx: U64,
  windowLimit: U64,
  windowDuration: Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 1n, maximum: MAX_I64 })),
  minTxInterval: Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 0n, maximum: MAX_I64 })),
  allowlistEnabled: Schema.Boolean,
  allowlist: Schema.Array(AddressSchema).check(Schema.isMaxLength(16)),
}).check(
  Schema.makeFilter(
    (value) =>
      value.maxPerTx <= value.windowLimit &&
      new Set(value.allowlist).size === value.allowlist.length &&
      !value.allowlist.includes(SYSTEM),
  ),
);
const Input = Schema.Struct({
  programAddress: AddressSchema,
  vaultAddress: AddressSchema,
  ownerAddress: AddressSchema,
  payerAddress: Schema.optionalKey(AddressSchema),
  agentKey: AddressSchema,
  limits: Limits,
});
const DISCRIMINATOR = new Uint8Array([67, 112, 105, 134, 177, 7, 231, 252]);

/** Build owner-authorized policy intent; signing and submission remain with the caller. */
export function createUpsertAgentPolicyInstruction(input: UpsertAgentPolicyInput) {
  return Effect.gen(function* () {
    const valid = yield* Schema.decodeUnknownEffect(Input, { onExcessProperty: 'error' })(
      input,
    ).pipe(
      Effect.mapError(
        () =>
          new BrimPolicyViolationError(
            'INVALID_CONFIG',
            'Provide valid owner policy addresses, limits, and at most 16 distinct recipients.',
          ),
      ),
    );
    if (valid.agentKey === SYSTEM)
      return yield* new BrimPolicyViolationError(
        'INVALID_CONFIG',
        'Agent public key cannot be the default address.',
      );
    const policyAddress = address(
      yield* fromPromise(
        () => findBrimPolicyAddress(valid.programAddress, valid.vaultAddress, valid.agentKey),
        'INVALID_CONFIG',
        'Policy address could not be derived.',
      ),
    );
    const { limits } = valid;
    const data = new Uint8Array(77 + 32 * limits.allowlist.length);
    const encoder = getAddressEncoder();
    data.set(DISCRIMINATOR);
    data.set(encoder.encode(address(valid.agentKey)), 8);
    const view = new DataView(data.buffer);
    view.setBigUint64(40, limits.maxPerTx, true);
    view.setBigUint64(48, limits.windowLimit, true);
    view.setBigInt64(56, limits.windowDuration, true);
    view.setBigInt64(64, limits.minTxInterval, true);
    data[72] = Number(limits.allowlistEnabled);
    view.setUint32(73, limits.allowlist.length, true);
    limits.allowlist.forEach((recipient, index) =>
      data.set(encoder.encode(address(recipient)), 77 + index * 32),
    );
    const instruction: Instruction = {
      programAddress: address(valid.programAddress),
      data,
      accounts: [
        {
          address: address(valid.payerAddress ?? valid.ownerAddress),
          role: AccountRole.WRITABLE_SIGNER,
        },
        { address: address(valid.ownerAddress), role: AccountRole.READONLY_SIGNER },
        { address: address(valid.vaultAddress), role: AccountRole.WRITABLE },
        { address: policyAddress, role: AccountRole.WRITABLE },
        { address: address(SYSTEM), role: AccountRole.READONLY },
      ],
    };
    return { instruction, policyAddress };
  });
}
