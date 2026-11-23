import { afterEach, expect, vi } from 'vitest';
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { NETWORKS, BRIM_DEVELOPMENT_PROGRAM_ADDRESS } from '../src/index.js';
import { findBrimPolicyAddress, findTokenAccount } from '../src/solana.js';
import type { BrimVaultConfigDetails, BrimConfig } from '../src/types.js';
import type { AgentPolicySnapshot } from '../src/policy.js';
import type { PaymentRequirements } from '@x402/core/types';

export const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
export const OWNER = '11111111111111111111111111111111';
export const SPONSOR = 'GyGKxMyg1p9SsHfm15MkNUu1u9TN2JtTspcdmrtGUdse';
export const MERCHANT = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const config: BrimConfig = {
  vaultAddress: OWNER,
  programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  agentSecretKey: new Uint8Array(64),
  rpcUrl: 'https://rpc.example.test',
  network: NETWORK,
  facilitator: { mode: 'smart-wallet-exact', feePayers: [SPONSOR] },
};
export const req: PaymentRequirements = {
  scheme: 'exact',
  network: NETWORK,
  amount: '40000',
  asset: NETWORKS[NETWORK].mint,
  payTo: MERCHANT,
  maxTimeoutSeconds: 60,
  extra: { feePayer: SPONSOR, transactionVersions: [0, 1] },
};
export const policy: AgentPolicySnapshot = {
  vault: OWNER,
  agentKey: OWNER,
  isFrozen: false,
  maxPerTx: 1_000_000n,
  windowLimit: 50_000_000n,
  windowDuration: 86400n,
  windowStart: 1000n,
  windowSpent: 49_000_000n,
  minTxInterval: 2n,
  lastTxTs: 1100n,
  allowlistEnabled: true,
  allowlist: [MERCHANT],
};
export function error(code: string) {
  return expect.objectContaining({ code });
}
export function paymentRequired(offers = [req]) {
  return new Response(null, {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': btoa(
        JSON.stringify({
          x402Version: 2,
          resource: {
            url: 'https://merchant.test/api',
            description: 'data',
            mimeType: 'application/json',
          },
          accepts: offers,
        }),
      ),
    },
  });
}
afterEach(() => vi.unstubAllGlobals());

export const vaultConfigDetails: BrimVaultConfigDetails = {
  vaultAddress: config.vaultAddress,
  programAddress: config.programAddress,
  network: config.network,
  facilitatorFeePayers: config.facilitator.feePayers,
};
export function encodedVaultConfig(value: unknown) {
  return (
    'brim:v1:' +
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  );
}

export async function fixture() {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(7));
  const secret = new Uint8Array(64);
  secret.set(new Uint8Array(32).fill(7));
  secret.set(getAddressEncoder().encode(signer.address), 32);
  const mint = NETWORKS[NETWORK].mint;
  const [vault, bump] = await getProgramDerivedAddress({
    programAddress: address(config.programAddress),
    seeds: [
      new TextEncoder().encode('vault'),
      getAddressEncoder().encode(address(OWNER)),
      getAddressEncoder().encode(address(mint)),
    ],
  });
  const policyAddress = await findBrimPolicyAddress(config.programAddress, vault, signer.address);
  const tokenAccount = await findTokenAccount(vault, mint);
  const accountDisc = async (name: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account:${name}`)),
    ).slice(0, 8);
  const vaultData = new Uint8Array(110);
  vaultData.set(await accountDisc('Vault'));
  vaultData.set(getAddressEncoder().encode(address(OWNER)), 8);
  vaultData.set(getAddressEncoder().encode(address(mint)), 40);
  vaultData.set(getAddressEncoder().encode(address(tokenAccount)), 72);
  vaultData[109] = bump;
  const policyData = new Uint8Array(135);
  policyData.set(await accountDisc('AgentPolicy'));
  policyData.set(getAddressEncoder().encode(vault), 8);
  policyData.set(getAddressEncoder().encode(signer.address), 40);
  const view = new DataView(policyData.buffer);
  view.setBigUint64(73, 1_000_000n, true);
  view.setBigUint64(81, 50_000_000n, true);
  view.setBigInt64(89, 86400n, true);
  view.setBigInt64(97, 1000n, true);
  const clock = new Uint8Array(40);
  new DataView(clock.buffer).setBigInt64(32, 1100n, true);
  const encoded = (data: Uint8Array, owner = config.programAddress) => ({
    data: [btoa(String.fromCharCode(...data)), 'base64'],
    executable: false,
    owner,
    lamports: 1_000_000,
    rentEpoch: 0,
    space: data.length,
  });
  const rpc = vi.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    let result: unknown;
    if (body.method === 'getGenesisHash') result = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    else if (body.method === 'getMultipleAccounts')
      result = {
        context: { slot: 1 },
        value: [
          encoded(vaultData),
          encoded(policyData),
          encoded(clock, 'Sysvar1111111111111111111111111111111111111'),
        ],
      };
    else if (body.method === 'getLatestBlockhash')
      result = { context: { slot: 1 }, value: { blockhash: OWNER, lastValidBlockHeight: 1000 } };
    else throw new Error(`Unexpected RPC ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', rpc);
  return {
    config: { ...config, agentSecretKey: secret, vaultAddress: vault },
    signer,
    policyAddress,
    rpc,
    policyData,
    vaultData,
  };
}
