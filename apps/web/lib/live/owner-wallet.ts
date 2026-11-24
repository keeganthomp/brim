/** Lazily imported browser-only owner policy entrypoint. Never accepts private keys. */
import { getWallets } from '@wallet-standard/app';
import { Effect } from 'effect';
import { connectFeature, ownerAccount, supportedOwnerWallet } from './owner-wallet-features';
import { ownerContext } from './owner-policy-state';
import { ownerRouting } from './owner-wallet-context';
import { submitPolicy } from './owner-policy-submit';
export {
  initializeOwnerVault,
  depositOwnerFunds,
  withdrawOwnerFunds,
  setOwnerAgentFrozen,
} from './owner-treasury';
export { readOwnerWalletReadiness } from './owner-treasury-state';
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
  OwnerDeploymentConfig,
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

/** Existing owner accounts come first; each connected owner is an explicit choice. */
export function discoverOwnerWallets(config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const context =
      'vaultConfig' in config ? yield* ownerContext(config) : yield* ownerRouting(config);
    const expectedOwner =
      'ownerAddress' in context && typeof context.ownerAddress === 'string'
        ? context.ownerAddress
        : undefined;
    return yield* ownerAttempt(
      () =>
        getWallets()
          .get()
          .flatMap<WalletChoice>((wallet) => {
            if (!supportedOwnerWallet(wallet, context.chain)) return [];
            const accounts = wallet.accounts.filter((account) =>
              ownerAccount(account, expectedOwner ?? account.address, context.chain),
            );
            if (!accounts.length)
              return typeof connectFeature(wallet)?.connect === 'function'
                ? [
                    {
                      id: walletId(wallet),
                      name: wallet.name.slice(0, 80),
                      connected: false,
                      wallet,
                    },
                  ]
                : [];
            return accounts.map((account) => ({
              id: `${walletId(wallet)}:${account.address}`,
              name: wallet.name.slice(0, 80),
              connected: true,
              wallet,
              ownerAddress: account.address,
            }));
          })
          .sort((a, b) => Number(b.connected) - Number(a.connected)),
      'NO_WALLET',
      'Wallet discovery is unavailable. Use a browser with a compatible Solana wallet.',
    );
  });
}

export function connectOwnerWallet(choice: WalletChoice, config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const routing =
      'vaultConfig' in config ? yield* ownerContext(config) : yield* ownerRouting(config);
    const expectedOwner =
      'ownerAddress' in routing && typeof routing.ownerAddress === 'string'
        ? routing.ownerAddress
        : choice.ownerAddress;
    const { wallet } = choice;
    const supported = yield* ownerAttempt(
      () => getWallets().get().includes(wallet) && supportedOwnerWallet(wallet, routing.chain),
      'WALLET_UNSUPPORTED',
      'Choose a compatible Solana wallet.',
    );
    if (!supported)
      return yield* ownerFailure(
        'WALLET_UNSUPPORTED',
        'This wallet does not support the configured network and v0 transactions.',
      );
    const find = () =>
      wallet.accounts.filter((account) =>
        ownerAccount(account, expectedOwner ?? account.address, routing.chain),
      );
    let accounts = yield* ownerAttempt(
      find,
      'WALLET_CHANGED',
      'Wallet account state is unavailable. Reconnect.',
    );
    if (!accounts.length) {
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
      accounts = yield* ownerAttempt(
        find,
        'WALLET_CHANGED',
        'Wallet account state is unavailable. Reconnect.',
      );
    }
    if (!accounts.length)
      return yield* ownerFailure(
        'OWNER_MISMATCH',
        'Select the wallet account that owns this vault.',
      );
    if (accounts.length !== 1)
      return yield* ownerFailure(
        'OWNER_SELECTION_REQUIRED',
        'Choose one owner account, then reconnect.',
      );
    const account = accounts[0]!;
    const context = yield* ownerContext(config, account.address);
    return {
      choiceId: choice.id,
      wallet,
      account,
      ownerAddress: context.ownerAddress,
      vaultAddress: context.vaultAddress,
      vaultConfig: context.vaultConfig,
      initialized: context.initialized,
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
