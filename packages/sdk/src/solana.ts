import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { Effect, Schema } from 'effect';
import { computeBudgetInstructions, transactionSizeExceeded } from '@x402/svm';
import { findTokenAccount } from './accounts.js';
import { loadPaymentState } from './chain.js';
import { EXECUTE_PAYMENT_DISCRIMINATOR, TOKEN_PROGRAM } from './constants.js';
import { attempt, fromPromise, run } from './effects.js';
import { BrimPolicyViolationError, fail } from './errors.js';
import type { ResolvedBrimConfig, ValidatedPayment } from './types.js';
export { decodeAgentPolicy, findBrimPolicyAddress, findTokenAccount } from './accounts.js';

const KeyBytes = Schema.Array(
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 255 })),
).check(Schema.isBetweenLength(64, 64));
function loadAgentSigner(secret: string | Uint8Array) {
  return Effect.gen(function* () {
    const key = yield* attempt(
      () =>
        Schema.decodeUnknownSync(KeyBytes)(
          typeof secret === 'string' ? JSON.parse(secret) : Array.from(secret),
        ),
      'INVALID_CONFIG',
      'Set BRIM_AGENT_KEY to the scoped agent key: a JSON array of 64 bytes.',
    );
    return yield* fromPromise(
      () => createKeyPairSignerFromBytes(new Uint8Array(key)),
      'INVALID_CONFIG',
      'Agent key is invalid. Ask your operator for a valid scoped key.',
    );
  });
}

export function createSolanaPaymentAdapter(config: ResolvedBrimConfig) {
  // The effect is lazy; no key parsing, RPC work, or signing occurs on setup.
  const signerEffect = loadAgentSigner(config.agentSecretKey);
  const rpc = createSolanaRpc(config.rpcUrl);
  const createTransactionEffect = (payment: ValidatedPayment) =>
    Effect.gen(function* () {
      const signer: KeyPairSigner = yield* signerEffect;
      const state = yield* loadPaymentState(config, signer, payment, rpc);
      const recipientTokenAccount = yield* fromPromise(
        () => findTokenAccount(payment.recipient, payment.asset),
        'INVALID_PAYMENT_REQUIREMENTS',
        'Recipient cannot receive this USDC payment.',
      );
      const isolated = [
        config.programAddress,
        config.vaultAddress,
        state.policyAddress,
        payment.asset,
        state.vaultTokenAccount,
        payment.recipient,
        recipientTokenAccount,
        TOKEN_PROGRAM,
        'ComputeBudget111111111111111111111111111111',
        'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
      ];
      if (isolated.includes(payment.feePayer))
        return yield* new BrimPolicyViolationError(
          'UNTRUSTED_FEE_PAYER',
          'Facilitator fee payer cannot appear in payment instruction accounts.',
        );
      const blockhash = yield* fromPromise(
        (signal) =>
          rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'Solana RPC is unavailable. Check SOLANA_RPC_URL and try again.',
      );
      const message = yield* attempt(
        () => {
          const data = new Uint8Array(16);
          data.set(EXECUTE_PAYMENT_DISCRIMINATOR);
          new DataView(data.buffer).setBigUint64(8, payment.amount, true);
          const execute = {
            programAddress: address(config.programAddress),
            data,
            accounts: [
              { address: signer.address, role: AccountRole.READONLY_SIGNER as const, signer },
              { address: address(config.vaultAddress), role: AccountRole.READONLY as const },
              { address: address(state.policyAddress), role: AccountRole.WRITABLE as const },
              { address: address(payment.asset), role: AccountRole.READONLY as const },
              { address: address(state.vaultTokenAccount), role: AccountRole.WRITABLE as const },
              { address: address(payment.recipient), role: AccountRole.READONLY as const },
              { address: address(recipientTokenAccount), role: AccountRole.WRITABLE as const },
              { address: address(TOKEN_PROGRAM), role: AccountRole.READONLY as const },
            ],
          };
          const memo: Instruction = {
            programAddress: address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            accounts: [],
            data: new TextEncoder().encode(payment.memo ?? crypto.randomUUID()),
          };
          return pipe(
            createTransactionMessage({ version: 0 }),
            (tx) => setTransactionMessageFeePayer(address(payment.feePayer), tx),
            (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, tx),
            (tx) =>
              appendTransactionMessageInstructions(
                [
                  ...computeBudgetInstructions(0, {
                    computeUnitLimit: 200_000,
                    computeUnitPriceMicroLamports: 1,
                  }),
                  execute,
                  memo,
                ],
                tx,
              ),
          );
        },
        'INVALID_PAYMENT_REQUIREMENTS',
        'Unable to build payment from these merchant details.',
      );
      const signed = yield* fromPromise(
        () => partiallySignTransactionMessageWithSigners(message),
        'SIGNING_FAILED',
        'Agent could not sign this payment. Check its scoped key.',
      );
      return yield* attempt(
        () => {
          const wire = getBase64EncodedWireTransaction(signed);
          if (transactionSizeExceeded(wire, 0))
            fail(
              'INVALID_PAYMENT_REQUIREMENTS',
              'Payment is too large. Ask the merchant for a shorter payment memo.',
            );
          return wire;
        },
        'SIGNING_FAILED',
        'Signed payment could not be encoded.',
      );
    });
  return {
    createTransactionEffect,
    createTransaction: (payment: ValidatedPayment) => run(createTransactionEffect(payment)),
  };
}
