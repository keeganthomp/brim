import { vi } from 'vitest';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { accountDiscriminator, findTokenAccount } from '../src/accounts.js';
import {
  BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  BRIM_NETWORK_IDS,
  NETWORKS,
  TOKEN_PROGRAM,
} from '../src/constants.js';
import { createBrimVaultConfig } from '../src/vault-config.js';

const decoder = getAddressDecoder();
const key = (byte: number) => decoder.decode(new Uint8Array(32).fill(byte));
export const agentPublicKey = key(7);
export const feePayer = key(8);
export const recipient = key(9);
const owner = key(10);
const network = BRIM_NETWORK_IDS.devnet;
const program = BRIM_DEVELOPMENT_PROGRAM_ADDRESS;
const encoder = getAddressEncoder();
const encode = (key: string) => encoder.encode(address(key));

export async function connectionFixture() {
  const mint = NETWORKS[network].mint;
  const [vaultAddress, bump] = await getProgramDerivedAddress({
    programAddress: address(program),
    seeds: [new TextEncoder().encode('vault'), encode(owner), encode(mint)],
  });
  const [policyAddress, policyBump] = await getProgramDerivedAddress({
    programAddress: address(program),
    seeds: [new TextEncoder().encode('agent'), encode(vaultAddress), encode(agentPublicKey)],
  });
  const vaultTokenAccount = await findTokenAccount(vaultAddress, mint);
  const vault = new Uint8Array(110);
  vault.set(await accountDiscriminator('Vault'));
  vault.set(encode(owner), 8);
  vault.set(encode(mint), 40);
  vault.set(encode(vaultTokenAccount), 72);
  vault[109] = bump;
  const policy = new Uint8Array(167);
  policy.set(await accountDiscriminator('AgentPolicy'));
  policy.set(encode(vaultAddress), 8);
  policy.set(encode(agentPublicKey), 40);
  policy[129] = 1;
  policy.set(encode(recipient), 134);
  policy[166] = policyBump;
  const view = new DataView(policy.buffer);
  view.setBigUint64(73, 1_000_000n, true);
  view.setBigUint64(81, 50_000_000n, true);
  view.setBigInt64(89, 86400n, true);
  view.setBigInt64(97, 1000n, true);
  view.setBigUint64(105, 3_000_000n, true);
  view.setBigInt64(113, 3n, true);
  view.setBigInt64(121, 1000n, true);
  view.setUint32(130, 1, true);
  const clock = new Uint8Array(40);
  new DataView(clock.buffer).setBigInt64(32, 1100n, true);
  const token = new Uint8Array(165);
  token.set(encode(mint));
  token.set(encode(vaultAddress), 32);
  token[108] = 1;
  new DataView(token.buffer).setBigUint64(64, 100_000_000n, true);
  const mintData = new Uint8Array(82);
  mintData[44] = 6;
  mintData[45] = 1;
  const account = (data: Uint8Array, owner = program, executable = false) => ({
    data,
    owner,
    executable,
  });
  const accounts: Array<ReturnType<typeof account> | null> = [
    account(vault),
    account(policy),
    account(clock, 'Sysvar1111111111111111111111111111111111111'),
    account(token, TOKEN_PROGRAM),
    account(mintData, TOKEN_PROGRAM),
    account(new Uint8Array(0), 'BPFLoaderUpgradeab1e11111111111111111111111', true),
  ];
  const f = {
    vault,
    policy,
    clock,
    token,
    mintData,
    accounts,
    vaultTokenAccount,
    policyAddress,
    genesis: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    input: {
      vaultConfig: createBrimVaultConfig({
        vaultAddress,
        programAddress: program,
        network,
        facilitatorFeePayers: [feePayer],
      }),
      agentPublicKey,
      rpcUrl: 'https://rpc.example.test',
    },
  };
  const rpc = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const result =
      body.method === 'getGenesisHash'
        ? f.genesis
        : body.method === 'getMultipleAccounts'
          ? {
              context: { slot: 1 },
              value: f.accounts.map((a) =>
                a
                  ? {
                      ...a,
                      data: [btoa(String.fromCharCode(...a.data)), 'base64'],
                      lamports: 1_000_000,
                      rentEpoch: 0,
                      space: a.data.length,
                    }
                  : null,
              ),
            }
          : undefined;
    if (result === undefined) throw new Error(`Unexpected RPC method ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', rpc);
  return {
    ...f,
    rpc,
    changeGenesis: (value: string) => {
      f.genesis = value;
    },
  };
}

export function challenge(overrides: Record<string, unknown> = {}) {
  return new Response(null, {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': btoa(
        JSON.stringify({
          x402Version: 2,
          resource: { url: 'https://merchant.example/report' },
          accepts: [
            {
              scheme: 'exact',
              network,
              amount: '40000',
              asset: NETWORKS[network].mint,
              payTo: recipient,
              maxTimeoutSeconds: 60,
              extra: { feePayer, transactionVersions: [0] },
              ...overrides,
            },
          ],
        }),
      ),
    },
  });
}
