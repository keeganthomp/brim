import {
  address,
  appendTransactionMessageInstructions,
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
  type Instruction,
  type Transaction,
} from '@solana/kit';
import { Effect } from 'effect';
import { getWallets } from '@wallet-standard/app';
import { ownerAccount, signFeature, supportedOwnerWallet } from './owner-wallet-features';
import type { OwnerContext } from './owner-policy-state';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  ownerRpc,
  type OwnerWalletConnection,
  type OwnerWalletError,
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
        'Wallet modified the reviewed owner transaction.',
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
        'The owner signature does not match the reviewed transaction.',
      );
    return signed;
  });
}
function confirmOwnerTransaction(
  context: OwnerContext,
  signature: ReturnType<typeof getSignatureFromTransaction>,
  kind: 'POLICY' | 'TREASURY',
) {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = yield* ownerRpc(
        (signal) =>
          context.rpc
            .getSignatureStatuses([signature], { searchTransactionHistory: true })
            .send({ abortSignal: signal }),
        `${kind}_OUTCOME_UNKNOWN`,
        'Transaction outcome is uncertain. Reconcile the transaction before another write.',
        signature,
      );
      const status = result.value[0];
      if (
        status &&
        (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')
      ) {
        if (status.err)
          return yield* ownerFailure(
            `${kind}_REJECTED`,
            'The owner transaction failed on-chain. Refresh the vault before trying again.',
            signature,
          );
        return;
      }
      yield* Effect.sleep('500 millis');
    }
    return yield* ownerFailure(
      `${kind}_OUTCOME_UNKNOWN`,
      'Confirmation timed out. Reconcile the transaction before another write.',
      signature,
    );
  }).pipe(
    Effect.timeout(30_000),
    Effect.mapError((error) =>
      error._tag === 'TimeoutError'
        ? ownerFailure(
            `${kind}_OUTCOME_UNKNOWN`,
            'Confirmation timed out. Reconcile the transaction before another write.',
            signature,
          )
        : error,
    ),
  );
}

export function assertOwnerConnection(connection: OwnerWalletConnection, context: OwnerContext) {
  return Effect.gen(function* () {
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
  });
}

/** One reviewed message, one owner signature, one broadcast; never retries a new authorization. */
export function signOwnerInstructions(
  connection: OwnerWalletConnection,
  context: OwnerContext,
  instructions: readonly Instruction[],
  kind: 'POLICY' | 'TREASURY' = 'POLICY',
  beforeSend?: Effect.Effect<void, OwnerWalletError>,
) {
  return Effect.gen(function* () {
    yield* assertOwnerConnection(connection, context);
    const lifetime = yield* ownerRpc(
      (signal) =>
        context.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not prepare a recent Solana transaction.',
    );
    const unsigned = yield* ownerAttempt(
      () =>
        compileTransaction(
          appendTransactionMessageInstructions(
            instructions,
            setTransactionMessageLifetimeUsingBlockhash(
              lifetime.value,
              setTransactionMessageFeePayer(
                address(context.ownerAddress),
                createTransactionMessage({ version: 0 }),
              ),
            ),
          ),
        ),
      'INVALID_TRANSACTION',
      'Could not build the reviewed owner transaction.',
    );
    const selected = yield* ownerAttempt(
      () => ({
        feature: signFeature(connection.wallet)!,
        account: connection.wallet.accounts.find((account) =>
          ownerAccount(account, context.ownerAddress, context.chain),
        )!,
      }),
      'WALLET_CHANGED',
      'Wallet account changed. Reconnect before saving.',
    );
    const outputs = yield* ownerIo(
      () =>
        selected.feature.signTransaction({
          account: selected.account,
          chain: context.chain,
          transaction: new Uint8Array(getTransactionEncoder().encode(unsigned)),
        }),
      'WALLET_REJECTED',
      'Wallet approval was declined or unavailable.',
    );
    yield* assertOwnerConnection(connection, context);
    const wire = yield* ownerAttempt(
      () => {
        if (
          !Array.isArray(outputs) ||
          outputs.length !== 1 ||
          !(outputs[0]?.signedTransaction instanceof Uint8Array)
        )
          throw new Error();
        return outputs[0].signedTransaction;
      },
      'INVALID_WALLET_TRANSACTION',
      'Wallet returned an unexpected signing result.',
    );
    const signed = yield* validateSignedTransaction(wire, unsigned, context.ownerAddress);
    if (beforeSend) yield* beforeSend;
    yield* assertOwnerConnection(connection, context);
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
      `${kind}_OUTCOME_UNKNOWN`,
      'Submission is uncertain. Reconcile the transaction before another write.',
      signature,
    );
    if (sent !== signature)
      return yield* ownerFailure(
        `${kind}_OUTCOME_UNKNOWN`,
        'RPC returned an unexpected signature. Reconcile the reviewed transaction.',
        signature,
      );
    yield* confirmOwnerTransaction(context, signature, kind);
    return signature;
  });
}
