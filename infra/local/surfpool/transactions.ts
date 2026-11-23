/** Shared instruction builders for synthetic local setup and SBF tests. */
import { createHash } from 'node:crypto';
import {
  AccountRole,
  address,
  blockhash,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import { Data, Effect, Schema } from 'effect';
import { MINT, PROGRAM, TOKEN, localRpc, localRpcEffect } from './config.ts';
import { attempt, decode, fromPromise, LocalSurfpoolError, run } from './effects.ts';

export const ATA = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM = address('11111111111111111111111111111111');
const MEMO = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const encoder = getAddressEncoder();
export const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Account = Address | TransactionSigner;
const meta = (account: Account, role = AccountRole.READONLY) =>
  typeof account === 'string'
    ? { address: account, role }
    : { address: account.address, role, signer: account };
export const readonly = (account: Account) => meta(account);
export const writable = (account: Account) => meta(account, AccountRole.WRITABLE);
export const signer = (account: TransactionSigner) => meta(account, AccountRole.READONLY_SIGNER);
export const writableSigner = (account: TransactionSigner) =>
  meta(account, AccountRole.WRITABLE_SIGNER);
export const u64 = (value: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value));
  return b;
};
export const i64 = (value: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(value));
  return b;
};
export const u32 = (value: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value);
  return b;
};
export function ix(
  name: string,
  accounts: NonNullable<Instruction['accounts']>,
  ...data: readonly Uint8Array[]
): Instruction {
  const discriminator = createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
  return { programAddress: PROGRAM, accounts, data: Buffer.concat([discriminator, ...data]) };
}
export async function pda(
  programAddress: Address,
  seeds: Parameters<typeof getProgramDerivedAddress>[0]['seeds'],
) {
  return (await getProgramDerivedAddress({ programAddress, seeds }))[0];
}
export async function tokenAccount(owner: Address) {
  return pda(ATA, [encoder.encode(owner), encoder.encode(TOKEN), encoder.encode(MINT)]);
}
export function createAta(
  payer: TransactionSigner,
  owner: Address,
  tokenAddress: Address,
): Instruction {
  return {
    programAddress: ATA,
    data: new Uint8Array([1]),
    accounts: [
      writableSigner(payer),
      writable(tokenAddress),
      readonly(owner),
      readonly(MINT),
      readonly(SYSTEM),
      readonly(TOKEN),
    ],
  };
}
class LocalTransactionError extends Data.TaggedError('LocalTransactionError')<{
  readonly message: string;
  readonly signature: string;
  readonly details: unknown;
}> {}
const Status = Schema.Struct({
  value: Schema.Array(
    Schema.NullOr(
      Schema.Struct({
        err: Schema.Unknown,
        confirmationStatus: Schema.NullOr(Schema.String),
      }),
    ),
  ),
});
const Blockhash = Schema.Struct({
  value: Schema.Struct({ blockhash: Schema.String, lastValidBlockHeight: Schema.Number }),
});
const AccountBytes = Schema.Struct({
  value: Schema.NullOr(
    Schema.Struct({ data: Schema.Tuple([Schema.String, Schema.Literal('base64')]) }),
  ),
});
const TokenBalance = Schema.Struct({ value: Schema.Struct({ amount: Schema.String }) });

export function createLocalClient(rpcUrl: string) {
  const rpc = (method: string, params: readonly unknown[] = []) => localRpc(rpcUrl, method, params);
  const rpcEffect = (method: string, params: readonly unknown[] = []) =>
    localRpcEffect(rpcUrl, method, params);
  let nonce = 0;
  const accountBytes = (pubkey: Address) =>
    run(
      Effect.gen(function* () {
        const { value } = yield* decode(
          AccountBytes,
          yield* rpcEffect('getAccountInfo', [
            pubkey,
            { encoding: 'base64', commitment: 'confirmed' },
          ]),
        );
        if (!value) return yield* new LocalSurfpoolError({ message: 'Missing local account.' });
        return Buffer.from(value.data[0], 'base64');
      }),
    );
  const tokenBalance = (pubkey: Address) =>
    run(
      Effect.gen(function* () {
        const result = yield* decode(
          TokenBalance,
          yield* rpcEffect('getTokenAccountBalance', [pubkey, { commitment: 'confirmed' }]),
        );
        return yield* attempt(() => BigInt(result.value.amount), 'Invalid local token balance.');
      }),
    );
  const confirmEffect = (signature: string) =>
    Effect.gen(function* () {
      for (let i = 0; i < 120; i++) {
        const { value } = yield* decode(
          Status,
          yield* rpcEffect('getSignatureStatuses', [
            [signature],
            { searchTransactionHistory: true },
          ]),
        );
        const status = value[0];
        if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus ?? '')) {
          if (status.err)
            return yield* new LocalTransactionError({
              message: 'Local transaction failed.',
              details: status.err,
              signature,
            });
          return signature;
        }
        yield* Effect.sleep('250 millis');
      }
      return yield* new LocalSurfpoolError({
        message: 'Local transaction confirmation timed out.',
      });
    });
  const prepareEffect = (payer: TransactionSigner, instructions: readonly Instruction[]) =>
    Effect.gen(function* () {
      const lifetime = yield* decode(
        Blockhash,
        yield* rpcEffect('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      );
      const message = yield* attempt(
        () =>
          pipe(
            createTransactionMessage({ version: 0 }),
            (tx) => setTransactionMessageFeePayerSigner(payer, tx),
            (tx) =>
              setTransactionMessageLifetimeUsingBlockhash(
                {
                  blockhash: blockhash(lifetime.value.blockhash),
                  lastValidBlockHeight: BigInt(lifetime.value.lastValidBlockHeight),
                },
                tx,
              ),
            (tx) =>
              appendTransactionMessageInstructions(
                [
                  ...instructions,
                  {
                    programAddress: MEMO,
                    accounts: [],
                    data: new TextEncoder().encode(`brim-local:${++nonce}`),
                  },
                ],
                tx,
              ),
          ),
        'Could not build a local transaction.',
      );
      const signed = yield* fromPromise(
        () => signTransactionMessageWithSigners(message),
        'Could not sign a local transaction.',
      );
      const wire = yield* attempt(
        () => getBase64EncodedWireTransaction(signed),
        'Could not encode a local transaction.',
      );
      const signature = yield* attempt(
        () => getSignatureFromTransaction(signed),
        'Could not identify a local transaction.',
      );
      return { wire, signature, lastValidBlockHeight: BigInt(lifetime.value.lastValidBlockHeight) };
    });
  const submitEffect = (prepared: { wire: string; signature: string }, skipPreflight = false) =>
    Effect.gen(function* () {
      const signature = yield* decode(
        Schema.String,
        yield* rpcEffect('sendTransaction', [
          prepared.wire,
          { encoding: 'base64', skipPreflight, preflightCommitment: 'confirmed', maxRetries: 3 },
        ]),
      );
      if (signature !== prepared.signature)
        return yield* new LocalSurfpoolError({
          message: 'Local transaction signature did not match.',
        });
      return signature;
    });
  const sendEffect = (
    payer: TransactionSigner,
    instructions: readonly Instruction[],
    skipPreflight = false,
  ) =>
    Effect.gen(function* () {
      const prepared = yield* prepareEffect(payer, instructions);
      yield* submitEffect(prepared, skipPreflight);
      return yield* confirmEffect(prepared.signature);
    });
  return {
    rpc,
    rpcEffect,
    sendEffect,
    prepareEffect,
    submitEffect,
    confirmEffect,
    accountBytes,
    tokenBalance,
    send: (payer: TransactionSigner, instructions: readonly Instruction[], skipPreflight = false) =>
      run(sendEffect(payer, instructions, skipPreflight)),
    confirm: (signature: string) => run(confirmEffect(signature)),
  };
}
