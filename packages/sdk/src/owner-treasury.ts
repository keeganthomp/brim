import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Instruction,
} from '@solana/kit';
import { Effect, Schema } from 'effect';
import { findBrimPolicyAddress, findTokenAccount } from './accounts.js';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  BRIM_NETWORK_IDS,
  NETWORKS,
  TOKEN_PROGRAM,
  type BrimNetwork,
  type BrimNetworkName,
} from './constants.js';
import { BrimPolicyViolationError } from './errors.js';
import { fromPromise } from './effects.js';
import { AddressSchema } from './schemas.js';

export interface OwnerTreasuryInput {
  programAddress: string;
  ownerAddress: string;
  network: BrimNetwork | BrimNetworkName;
  payerAddress?: string;
  mintAddress?: string;
}
export type InitVaultInput = OwnerTreasuryInput;
export interface VaultAmountInput extends OwnerTreasuryInput {
  vaultAddress: string;
  amount: bigint;
}
export interface VaultDepositInput extends VaultAmountInput {
  sourceTokenAccount?: string;
}
export interface SetAgentFrozenInput extends OwnerTreasuryInput {
  vaultAddress: string;
  agentKey: string;
  isFrozen: boolean;
}

const SYSTEM = '11111111111111111111111111111111';
const INIT = [77, 79, 85, 150, 33, 217, 52, 106];
const WITHDRAW = [183, 18, 70, 156, 148, 109, 161, 34];
const FROZEN = [0, 76, 94, 23, 53, 142, 144, 55];
const invalid = () =>
  new BrimPolicyViolationError(
    'INVALID_CONFIG',
    'Use canonical vault and wallet accounts, official USDC, and a positive integer amount.',
  );
const PublicKey = AddressSchema.check(Schema.makeFilter((key) => key !== SYSTEM));
const fields = {
  programAddress: PublicKey,
  ownerAddress: PublicKey,
  network: Schema.Literals([
    'devnet',
    'mainnet',
    BRIM_NETWORK_IDS.devnet,
    BRIM_NETWORK_IDS.mainnet,
  ]),
  payerAddress: Schema.optionalKey(PublicKey),
  mintAddress: Schema.optionalKey(AddressSchema),
};
const Init = Schema.Struct(fields);
const amountFields = {
  ...fields,
  vaultAddress: PublicKey,
  amount: Schema.BigInt.check(
    Schema.isBetweenBigInt({ minimum: 1n, maximum: 0xffff_ffff_ffff_ffffn }),
  ),
};
const Deposit = Schema.Struct({
  ...amountFields,
  sourceTokenAccount: Schema.optionalKey(AddressSchema),
});
const Withdraw = Schema.Struct(amountFields);
const Frozen = Schema.Struct({
  ...fields,
  vaultAddress: PublicKey,
  agentKey: PublicKey,
  isFrozen: Schema.Boolean,
});
const decode = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })(input).pipe(
    Effect.mapError(invalid),
  );
const meta = (key: string, role = AccountRole.READONLY) => ({ address: address(key), role });

function context(input: OwnerTreasuryInput, suppliedVault?: string) {
  return Effect.gen(function* () {
    const network =
      input.network === 'devnet'
        ? BRIM_NETWORK_IDS.devnet
        : input.network === 'mainnet'
          ? BRIM_NETWORK_IDS.mainnet
          : input.network;
    const mintAddress = address(NETWORKS[network].mint);
    if (input.mintAddress !== undefined && input.mintAddress !== mintAddress)
      return yield* invalid();
    const programAddress = address(input.programAddress);
    const ownerAddress = address(input.ownerAddress);
    const payerAddress = address(input.payerAddress ?? input.ownerAddress);
    const encoder = getAddressEncoder();
    const [vaultAddress, vaultBump] = yield* fromPromise(
      () =>
        getProgramDerivedAddress({
          programAddress,
          seeds: [
            new TextEncoder().encode('vault'),
            encoder.encode(ownerAddress),
            encoder.encode(mintAddress),
          ],
        }),
      'INVALID_CONFIG',
      'Canonical vault derivation failed.',
    );
    if (suppliedVault !== undefined && suppliedVault !== vaultAddress) return yield* invalid();
    const vaultTokenAccount = address(
      yield* fromPromise(
        () => findTokenAccount(vaultAddress, mintAddress),
        'INVALID_CONFIG',
        'Vault USDC account derivation failed.',
      ),
    );
    return {
      programAddress,
      ownerAddress,
      payerAddress,
      network,
      mintAddress,
      vaultAddress,
      vaultBump,
      vaultTokenAccount,
    };
  });
}
function createAta(
  payer: string,
  authority: string,
  mint: string,
  tokenAccount: string,
): Instruction {
  return {
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
    data: new Uint8Array([1]),
    accounts: [
      meta(payer, AccountRole.WRITABLE_SIGNER),
      meta(tokenAccount, AccountRole.WRITABLE),
      meta(authority),
      meta(mint),
      meta(SYSTEM),
      meta(TOKEN_PROGRAM),
    ],
  };
}
const ownerAta = (owner: string, mint: string) =>
  fromPromise(
    () => findTokenAccount(owner, mint),
    'INVALID_CONFIG',
    'Wallet USDC account derivation failed.',
  );

/** Unsigned init intent. The caller verifies deployment and signs/submits with its wallet. */
export function createInitVaultInstruction(input: InitVaultInput) {
  return Effect.gen(function* () {
    const valid = yield* decode(Init, input);
    const state = yield* context(valid);
    const instruction: Instruction = {
      programAddress: state.programAddress,
      data: new Uint8Array(INIT),
      accounts: [
        meta(state.payerAddress, AccountRole.WRITABLE_SIGNER),
        meta(state.ownerAddress, AccountRole.READONLY_SIGNER),
        meta(state.mintAddress),
        meta(state.vaultAddress, AccountRole.WRITABLE),
        meta(state.vaultTokenAccount, AccountRole.WRITABLE),
        meta(TOKEN_PROGRAM),
        meta(ASSOCIATED_TOKEN_PROGRAM),
        meta(SYSTEM),
      ],
    };
    return { ...state, instruction };
  });
}

/** Exact legacy-token transfer_checked from the owner's canonical USDC ATA. No approvals. */
export function createVaultDepositInstructions(input: VaultDepositInput) {
  return Effect.gen(function* () {
    const valid = yield* decode(Deposit, input);
    const state = yield* context(valid, valid.vaultAddress);
    const sourceTokenAccount = address(yield* ownerAta(state.ownerAddress, state.mintAddress));
    if (valid.sourceTokenAccount !== undefined && valid.sourceTokenAccount !== sourceTokenAccount)
      return yield* invalid();
    const data = new Uint8Array(10);
    data[0] = 12; // SPL Token TransferChecked.
    new DataView(data.buffer).setBigUint64(1, valid.amount, true);
    data[9] = 6;
    const transfer: Instruction = {
      programAddress: address(TOKEN_PROGRAM),
      data,
      accounts: [
        meta(sourceTokenAccount, AccountRole.WRITABLE),
        meta(state.mintAddress),
        meta(state.vaultTokenAccount, AccountRole.WRITABLE),
        meta(state.ownerAddress, AccountRole.READONLY_SIGNER),
      ],
    };
    return {
      ...state,
      sourceTokenAccount,
      instructions: [
        createAta(
          state.payerAddress,
          state.vaultAddress,
          state.mintAddress,
          state.vaultTokenAccount,
        ),
        transfer,
      ],
    };
  });
}

/** Idempotently creates the owner's ATA before the existing owner-only withdraw instruction. */
export function createVaultWithdrawInstructions(input: VaultAmountInput) {
  return Effect.gen(function* () {
    const valid = yield* decode(Withdraw, input);
    const state = yield* context(valid, valid.vaultAddress);
    const ownerTokenAccount = address(yield* ownerAta(state.ownerAddress, state.mintAddress));
    const data = new Uint8Array(16);
    data.set(WITHDRAW);
    new DataView(data.buffer).setBigUint64(8, valid.amount, true);
    const withdraw: Instruction = {
      programAddress: state.programAddress,
      data,
      accounts: [
        meta(state.ownerAddress, AccountRole.READONLY_SIGNER),
        meta(state.vaultAddress),
        meta(state.mintAddress),
        meta(state.vaultTokenAccount, AccountRole.WRITABLE),
        meta(ownerTokenAccount, AccountRole.WRITABLE),
        meta(TOKEN_PROGRAM),
      ],
    };
    return {
      ...state,
      ownerTokenAccount,
      instructions: [
        createAta(state.payerAddress, state.ownerAddress, state.mintAddress, ownerTokenAccount),
        withdraw,
      ],
    };
  });
}

/** Freezing and resuming require the vault owner's signature; agent keys grant no control. */
export function createSetAgentFrozenInstruction(input: SetAgentFrozenInput) {
  return Effect.gen(function* () {
    const valid = yield* decode(Frozen, input);
    const state = yield* context(valid, valid.vaultAddress);
    const policyAddress = address(
      yield* fromPromise(
        () => findBrimPolicyAddress(state.programAddress, state.vaultAddress, valid.agentKey),
        'INVALID_CONFIG',
        'Canonical agent policy derivation failed.',
      ),
    );
    const data = new Uint8Array(9);
    data.set(FROZEN);
    data[8] = Number(valid.isFrozen);
    const instruction: Instruction = {
      programAddress: state.programAddress,
      data,
      accounts: [
        meta(state.ownerAddress, AccountRole.READONLY_SIGNER),
        meta(state.vaultAddress),
        meta(policyAddress, AccountRole.WRITABLE),
      ],
    };
    return { ...state, policyAddress, instruction };
  });
}
