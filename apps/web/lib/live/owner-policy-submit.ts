import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  verifySignature,
  type Transaction,
} from '@solana/kit';
import { createUpsertAgentPolicyInstruction } from '@brim/sdk';
import { Effect } from 'effect';
import { getWallets } from '@wallet-standard/app';
import { ownerAccount, signFeature, supportedOwnerWallet } from './owner-wallet-features';
import {
  ownerContext,
  policyMatches,
  readOwnerPolicy,
  type OwnerContext,
} from './owner-policy-state';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  ownerRpc,
  type OwnerPolicyInput,
  type OwnerWalletConfig,
  type OwnerWalletConnection,
} from './owner-wallet-types';

function connectionCurrent(connection: OwnerWalletConnection, context: OwnerContext) {
  return (
    getWallets().get().includes(connection.wallet) &&
    connection.ownerAddress === context.ownerAddress &&
    supportedOwnerWallet(connection.wallet, context.chain) &&
    connection.wallet.accounts.some((account) =>
      ownerAccount(account, context.ownerAddress, context.chain),
    ) &&
    ownerAccount(connection.account, context.ownerAddress, context.chain)
  );
}
function validateSignedTransaction(wire: Uint8Array, unsigned: Transaction, ownerAddress: string) {
  return Effect.gen(function* () {
    const signed = yield* ownerAttempt(
      () => getTransactionDecoder().decode(wire),
      'INVALID_WALLET_TRANSACTION',
      'Wallet returned an invalid transaction.',
    );
    if (
      signed.messageBytes.length !== unsigned.messageBytes.length ||
      !signed.messageBytes.every((value, index) => value === unsigned.messageBytes[index]) ||
      Object.keys(signed.signatures).length !== 1
    )
      return yield* ownerFailure(
        'INVALID_WALLET_TRANSACTION',
        'Wallet modified the reviewed policy transaction.',
      );
    const ownerSignature = signed.signatures[address(ownerAddress)];
    if (!ownerSignature)
      return yield* ownerFailure(
        'INVALID_WALLET_TRANSACTION',
        'The vault owner signature is missing.',
      );
    const key = yield* ownerIo(
      () =>
        crypto.subtle.importKey(
          'raw',
          new Uint8Array(getAddressEncoder().encode(address(ownerAddress))),
          'Ed25519',
          true,
          ['verify'],
        ),
      'WALLET_UNSUPPORTED',
      'This browser cannot verify Solana wallet signatures.',
    );
    const verified = yield* ownerIo(
      () => verifySignature(key, ownerSignature, signed.messageBytes),
      'INVALID_WALLET_TRANSACTION',
      'Could not verify the owner signature.',
    );
    if (!verified)
      return yield* ownerFailure(
        'INVALID_WALLET_TRANSACTION',
        'The owner signature does not match the reviewed policy.',
      );
    return signed;
  });
}
function confirmPolicy(
  context: OwnerContext,
  signature: ReturnType<typeof getSignatureFromTransaction>,
) {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = yield* ownerRpc(
        (signal) =>
          context.rpc
            .getSignatureStatuses([signature], { searchTransactionHistory: true })
            .send({ abortSignal: signal }),
        'POLICY_OUTCOME_UNKNOWN',
        'Policy outcome is uncertain. Reconcile the transaction before another write.',
        signature,
      );
      const status = result.value[0];
      if (
        status &&
        (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')
      ) {
        if (status.err)
          return yield* ownerFailure(
            'POLICY_REJECTED',
            'The policy transaction failed on-chain. Refresh the vault before trying again.',
            signature,
          );
        return;
      }
      yield* Effect.sleep('500 millis');
    }
    return yield* ownerFailure(
      'POLICY_OUTCOME_UNKNOWN',
      'Confirmation timed out. Reconcile the transaction before another write.',
      signature,
    );
  }).pipe(
    Effect.timeout(30_000),
    Effect.mapError((error) =>
      error._tag === 'TimeoutError'
        ? ownerFailure(
            'POLICY_OUTCOME_UNKNOWN',
            'Confirmation timed out. Reconcile the transaction before another write.',
            signature,
          )
        : error,
    ),
  );
}
function checkIntent(context: OwnerContext, input: OwnerPolicyInput, policyAddress: string) {
  return Effect.gen(function* () {
    const existing = yield* readOwnerPolicy(context, policyAddress);
    if (input.intent === 'create' && existing)
      return yield* ownerFailure(
        'POLICY_EXISTS',
        'This agent already has a policy. Open it to update its limits.',
      );
    if (input.intent === 'update' && !existing)
      return yield* ownerFailure(
        'POLICY_MISSING',
        'This agent has no policy. Add it before updating.',
      );
    if (
      existing &&
      (existing.vault !== context.vaultAddress ||
        existing.agentKey !== input.agentKey ||
        existing.windowDuration !== input.limits.windowDuration)
    )
      return yield* ownerFailure(
        'INVALID_POLICY',
        'An existing policy window duration cannot change. Refresh the policy.',
      );
  });
}
export function submitPolicy(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: OwnerPolicyInput,
) {
  return Effect.gen(function* () {
    const reviewed = yield* ownerAttempt(
      () => ({ ...input, limits: { ...input.limits, allowlist: [...input.limits.allowlist] } }),
      'INVALID_POLICY',
      'Review the agent key and policy limits.',
    );
    if (!['create', 'update'].includes(reviewed.intent))
      return yield* ownerFailure('INVALID_POLICY', 'Choose create or update for this policy.');
    const context = yield* ownerContext(config);
    if (
      !(yield* ownerAttempt(
        () => connectionCurrent(connection, context),
        'WALLET_CHANGED',
        'Wallet state changed. Reconnect the owner account.',
      ))
    )
      return yield* ownerFailure(
        'WALLET_CHANGED',
        'Reconnect the vault owner account before saving.',
      );
    const built = yield* createUpsertAgentPolicyInstruction({
      programAddress: context.programAddress,
      vaultAddress: context.vaultAddress,
      ownerAddress: context.ownerAddress,
      agentKey: reviewed.agentKey,
      limits: reviewed.limits,
    }).pipe(
      Effect.mapError(() =>
        ownerFailure(
          'INVALID_POLICY',
          'Review the agent public key, limits, and approved recipients.',
        ),
      ),
    );
    yield* checkIntent(context, reviewed, built.policyAddress);
    const lifetime = yield* ownerRpc(
      (signal) =>
        context.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not prepare a recent Solana transaction.',
    );
    const unsigned = yield* ownerAttempt(
      () =>
        compileTransaction(
          appendTransactionMessageInstruction(
            built.instruction,
            setTransactionMessageLifetimeUsingBlockhash(
              lifetime.value,
              setTransactionMessageFeePayer(
                address(context.ownerAddress),
                createTransactionMessage({ version: 0 }),
              ),
            ),
          ),
        ),
      'INVALID_POLICY',
      'Could not build the reviewed policy transaction.',
    );
    const feature = signFeature(connection.wallet)!;
    const activeAccount = connection.wallet.accounts.find((account) =>
      ownerAccount(account, context.ownerAddress, context.chain),
    )!;
    const outputs = yield* ownerIo(
      () =>
        feature.signTransaction({
          account: activeAccount,
          chain: context.chain,
          transaction: new Uint8Array(getTransactionEncoder().encode(unsigned)),
        }),
      'WALLET_REJECTED',
      'Wallet approval was declined or unavailable.',
    );
    if (
      !(yield* ownerAttempt(
        () => connectionCurrent(connection, context),
        'WALLET_CHANGED',
        'Wallet state changed. Reconnect the owner account.',
      ))
    )
      return yield* ownerFailure(
        'WALLET_CHANGED',
        'The owner account changed during approval. Reconnect before saving.',
      );
    if (outputs.length !== 1 || !outputs[0])
      return yield* ownerFailure(
        'INVALID_WALLET_TRANSACTION',
        'Wallet returned an unexpected signing result.',
      );
    const signed = yield* validateSignedTransaction(
      outputs[0].signedTransaction,
      unsigned,
      context.ownerAddress,
    );
    yield* checkIntent(context, reviewed, built.policyAddress);
    const signature = getSignatureFromTransaction(signed);
    const sent = yield* ownerRpc(
      (signal) =>
        context.rpc
          .sendTransaction(getBase64EncodedWireTransaction(signed), {
            encoding: 'base64',
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3n,
          })
          .send({ abortSignal: signal }),
      'POLICY_OUTCOME_UNKNOWN',
      'Submission is uncertain. Reconcile the transaction before another write.',
      signature,
    );
    if (sent !== signature)
      return yield* ownerFailure(
        'POLICY_OUTCOME_UNKNOWN',
        'RPC returned an unexpected signature. Reconcile the reviewed transaction.',
        signature,
      );
    yield* confirmPolicy(context, signature);
    const saved = yield* readOwnerPolicy(context, built.policyAddress, signature);
    if (!saved || !policyMatches(saved, reviewed.agentKey, context, reviewed.limits))
      return yield* ownerFailure(
        'POLICY_READBACK_MISMATCH',
        'The confirmed policy differs from this request. Refresh the vault before another write.',
        signature,
      );
    return { signature, policyAddress: built.policyAddress };
  });
}
