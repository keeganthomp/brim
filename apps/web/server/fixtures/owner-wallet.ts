import { vi } from 'vitest';
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  signTransactionWithSigners,
} from '@solana/kit';
import {
  BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  createBrimVaultConfig,
  findTokenAccount,
  type OwnerPolicyLimits,
} from '@brim/sdk';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { fixtureTreasury } from './owner-treasury-state';

export const OWNER_LIMITS: OwnerPolicyLimits = {
  maxPerTx: 1_000_000n,
  windowLimit: 50_000_000n,
  windowDuration: 86_400n,
  minTxInterval: 2n,
  allowlistEnabled: false,
  allowlist: [],
};
export async function ownerFixture(registry: { wallets: Wallet[] }) {
  const owner = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(31));
  const agent = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(32));
  const mint = address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  const encoder = getAddressEncoder();
  const [vault, bump] = await getProgramDerivedAddress({
    programAddress: address(BRIM_DEVELOPMENT_PROGRAM_ADDRESS),
    seeds: [new TextEncoder().encode('vault'), encoder.encode(owner.address), encoder.encode(mint)],
  });
  const tokenAccount = await findTokenAccount(vault, mint);
  const ownerTokenAccount = await findTokenAccount(owner.address, mint);
  const treasury = fixtureTreasury(
    owner.address,
    mint,
    BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
    ownerTokenAccount,
    tokenAccount,
    vault,
  );
  const account: WalletAccount = {
    address: owner.address,
    publicKey: new Uint8Array(encoder.encode(owner.address)),
    chains: ['solana:devnet'],
    features: ['solana:signTransaction'],
  };
  const state = {
    accounts: [account] as readonly WalletAccount[],
    policy: null as Uint8Array | null,
    sendFailure: false,
    confirmFailure: false,
    chainError: false,
    alterMessage: false,
    alterSignature: false,
    disconnectOnSign: false,
    createDuringApproval: false,
    recreateAccounts: false,
  };
  const vaultData = new Uint8Array(110);
  vaultData.set([211, 8, 232, 43, 2, 152, 117, 119]);
  vaultData.set(encoder.encode(owner.address), 8);
  vaultData.set(encoder.encode(mint), 40);
  vaultData.set(encoder.encode(address(tokenAccount)), 72);
  vaultData[109] = bump;
  const policyData = (limits: OwnerPolicyLimits = OWNER_LIMITS) => {
    const data = new Uint8Array(647);
    data.set([148, 193, 218, 129, 21, 96, 195, 77]);
    data.set(encoder.encode(vault), 8);
    data.set(encoder.encode(agent.address), 40);
    const view = new DataView(data.buffer);
    view.setBigUint64(73, limits.maxPerTx, true);
    view.setBigUint64(81, limits.windowLimit, true);
    view.setBigInt64(89, limits.windowDuration, true);
    view.setBigInt64(97, 1000n, true);
    view.setBigInt64(113, limits.minTxInterval, true);
    data[129] = Number(limits.allowlistEnabled);
    view.setUint32(130, limits.allowlist.length, true);
    limits.allowlist.forEach((recipient, index) =>
      data.set(encoder.encode(address(recipient)), 134 + 32 * index),
    );
    return data;
  };
  const connect = vi.fn(async () => {
    state.accounts = [account];
    return { accounts: state.accounts };
  });
  const sign = vi.fn(async (input: { transaction: Uint8Array }) => {
    const tx = getTransactionDecoder().decode(input.transaction);
    const signed = await signTransactionWithSigners([owner], tx);
    const wire = new Uint8Array(getTransactionEncoder().encode(signed));
    if (state.alterMessage) wire[wire.length - 1] = wire[wire.length - 1]! ^ 1;
    if (state.alterSignature) wire[1] = wire[1]! ^ 1;
    if (state.disconnectOnSign) state.accounts = [];
    if (state.createDuringApproval) state.policy = policyData();
    return [{ signedTransaction: wire }];
  });
  const signFeature = {
    version: '1.0.0' as const,
    supportedTransactionVersions: [0] as (0 | 1)[],
    signTransaction: sign,
  };
  const wallet: Wallet = {
    version: '1.0.0',
    name: 'Synthetic owner wallet',
    icon: 'data:image/png;base64,AA==',
    chains: ['solana:devnet'],
    get accounts() {
      return state.recreateAccounts
        ? state.accounts.map((value) => ({ ...value, publicKey: value.publicKey.slice() }))
        : state.accounts;
    },
    features: {
      'standard:connect': { version: '1.0.0', connect },
      'solana:signTransaction': signFeature,
    },
  };
  registry.wallets = [wallet];
  const encoded = (data: Uint8Array) => ({
    data: [btoa(String.fromCharCode(...data)), 'base64'],
    owner: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
    executable: false,
    lamports: 1_000_000,
    rentEpoch: 0,
    space: data.length,
  });
  const rpc = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    let result: unknown;
    if (body.method === 'getGenesisHash') result = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    else if (body.method === 'getBalance')
      result = { context: { slot: 1 }, value: treasury.state.solBalance };
    else if (body.method === 'getAccountInfo') {
      const additional = treasury.account(body.params[0]);
      result = {
        context: { slot: 1 },
        value:
          additional === undefined
            ? body.params[0] === vault
              ? treasury.state.initialized
                ? encoded(vaultData)
                : null
              : state.policy
                ? encoded(state.policy)
                : null
            : additional,
      };
    } else if (body.method === 'getLatestBlockhash')
      result = {
        context: { slot: 1 },
        value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000 },
      };
    else if (body.method === 'sendTransaction') {
      if (state.sendFailure) throw new Error('PRIVATE_RPC_DETAIL');
      const tx = getTransactionDecoder().decode(
        Uint8Array.from(atob(body.params[0]), (c) => c.charCodeAt(0)),
      );
      treasury.apply(tx, state.policy);
      if (!state.policy) state.policy = policyData();
      result = getSignatureFromTransaction(tx);
    } else if (body.method === 'getSignatureStatuses') {
      if (state.confirmFailure) throw new Error('PRIVATE_RPC_DETAIL');
      result = {
        context: { slot: 1 },
        value: [
          {
            confirmationStatus: 'confirmed',
            slot: 1,
            confirmations: 1,
            err: state.chainError ? { InstructionError: [0, 'Custom'] } : null,
          },
        ],
      };
    } else throw new Error('Unexpected fixture RPC');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', rpc);
  return {
    owner,
    agent,
    wallet,
    account,
    state,
    connect,
    sign,
    signFeature,
    rpc,
    policyData,
    treasury: treasury.state,
    vault,
    deployment: {
      programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
      network: 'devnet' as const,
      facilitatorFeePayers: [agent.address],
      rpcUrl: 'http://127.0.0.1:8899',
    },
    config: {
      vaultConfig: createBrimVaultConfig({
        programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
        vaultAddress: vault,
        network: 'devnet',
        facilitatorFeePayers: [agent.address],
      }),
      rpcUrl: 'http://127.0.0.1:8899',
    },
    input: { agentKey: agent.address, limits: OWNER_LIMITS, intent: 'create' as const },
  };
}
