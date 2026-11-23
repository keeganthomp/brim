/** Lazily imported browser-only owner policy entrypoint. Never accepts private keys. */
import { getWallets } from '@wallet-standard/app';
import { Effect } from 'effect';
import { connectFeature, ownerAccount, supportedOwnerWallet } from './owner-wallet-features';
import { ownerContext } from './owner-policy-state';
import { submitPolicy } from './owner-policy-submit';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  type OwnerWalletConfig,
  type OwnerWalletConnection,
  type WalletChoice,
  type OwnerPolicyInput,
} from './owner-wallet-types';
export { OwnerWalletError } from './owner-wallet-types';
export type {
  OwnerWalletConfig,
  OwnerWalletConnection,
  WalletChoice,
  OwnerPolicyInput,
} from './owner-wallet-types';

const ids = new WeakMap<object, string>();
let nextId = 0;
function walletId(wallet: object) {
  let id = ids.get(wallet);
  if (!id) {
    id = `wallet-${++nextId}`;
    ids.set(wallet, id);
  }
  return id;
}

/** Existing matching owner accounts come first; caller chooses explicitly if several remain. */
export function discoverOwnerWallets(config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const context = yield* ownerContext(config);
    return yield* ownerAttempt(
      () =>
        getWallets()
          .get()
          .filter(
            (wallet) =>
              supportedOwnerWallet(wallet, context.chain) &&
              (wallet.accounts.some((account) =>
                ownerAccount(account, context.ownerAddress, context.chain),
              ) ||
                typeof connectFeature(wallet)?.connect === 'function'),
          )
          .map((wallet) => ({
            id: walletId(wallet),
            name: wallet.name.slice(0, 80),
            connected: wallet.accounts.some((account) =>
              ownerAccount(account, context.ownerAddress, context.chain),
            ),
            wallet,
          }))
          .sort((a, b) => Number(b.connected) - Number(a.connected)),
      'NO_WALLET',
      'Wallet discovery is unavailable. Use a browser with a compatible Solana wallet.',
    );
  });
}

export function connectOwnerWallet(choice: WalletChoice, config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const context = yield* ownerContext(config);
    const { wallet } = choice;
    const supported = yield* ownerAttempt(
      () => getWallets().get().includes(wallet) && supportedOwnerWallet(wallet, context.chain),
      'WALLET_UNSUPPORTED',
      'Choose a compatible Solana wallet.',
    );
    if (!supported)
      return yield* ownerFailure(
        'WALLET_UNSUPPORTED',
        'This wallet does not support the configured network and v0 transactions.',
      );
    let account = wallet.accounts.find((value) =>
      ownerAccount(value, context.ownerAddress, context.chain),
    );
    if (!account) {
      const feature = connectFeature(wallet);
      if (!feature)
        return yield* ownerFailure(
          'WALLET_UNSUPPORTED',
          'This wallet cannot connect an owner account.',
        );
      yield* ownerIo(
        () => feature.connect(),
        'WALLET_REJECTED',
        'Wallet connection was declined or unavailable.',
      );
      account = wallet.accounts.find((value) =>
        ownerAccount(value, context.ownerAddress, context.chain),
      );
    }
    if (!account)
      return yield* ownerFailure(
        'OWNER_MISMATCH',
        'Select the wallet account that owns this vault.',
      );
    return {
      choiceId: choice.id,
      wallet,
      account,
      ownerAddress: context.ownerAddress,
    } satisfies OwnerWalletConnection;
  });
}

export function submitOwnerPolicy(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: OwnerPolicyInput,
) {
  return submitPolicy(connection, config, input);
}
