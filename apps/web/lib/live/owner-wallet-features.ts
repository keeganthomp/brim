import { address, getAddressEncoder } from '@solana/kit';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import {
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

export const signFeature = (wallet: Wallet) =>
  wallet.features[SolanaSignTransaction] as
    SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
export const connectFeature = (wallet: Wallet) =>
  wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined;
export function supportedOwnerWallet(wallet: Wallet, chain: string) {
  const feature = signFeature(wallet);
  return (
    wallet.chains.includes(chain as `${string}:${string}`) &&
    feature?.version === '1.0.0' &&
    typeof feature.signTransaction === 'function' &&
    Array.isArray(feature.supportedTransactionVersions) &&
    feature.supportedTransactionVersions.includes(0)
  );
}
export function ownerAccount(account: WalletAccount, ownerAddress: string, chain: string) {
  const key = getAddressEncoder().encode(address(ownerAddress));
  return (
    account.address === ownerAddress &&
    account.chains.includes(chain as `${string}:${string}`) &&
    account.features.includes(SolanaSignTransaction) &&
    account.publicKey.length === key.length &&
    key.every((value, index) => value === account.publicKey[index])
  );
}
