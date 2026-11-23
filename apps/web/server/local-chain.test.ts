import { createHash } from 'node:crypto';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { findTokenAccount } from '@brim/sdk';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocalChain } from './local-chain';
import { readVaultState } from '../lib/chain/read-vault';
import { toWorkspaceAgents, workspaceAgentName } from '../lib/chain/workspace-agents';
import {
  DEVNET_GENESIS,
  LOCAL_USDC_MINT,
  POLICY_ACCOUNT_BYTES,
  TOKEN_PROGRAM,
} from './local-schema';

const encoder = getAddressEncoder();
const decoder = getAddressDecoder();
const key = (value: number) => decoder.decode(new Uint8Array(32).fill(value));
const programAddress = 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo';
const disc = (name: string) =>
  createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
const info = (data: Buffer, owner: string) => ({
  data: [data.toString('base64'), 'base64'],
  executable: false,
  lamports: 1,
  owner,
  rentEpoch: 0,
  space: data.length,
});
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const owner = key(1);
  const agentAddress = key(2);
  const secondAgent = key(3);
  const [vaultAddress, bump] = await getProgramDerivedAddress({
    programAddress: address(programAddress),
    seeds: [
      Buffer.from('vault'),
      encoder.encode(address(owner)),
      encoder.encode(address(LOCAL_USDC_MINT)),
    ],
  });
  const ata = await findTokenAccount(vaultAddress, LOCAL_USDC_MINT);
  const vault = Buffer.alloc(110);
  vault.set(disc('Vault'));
  vault.set(encoder.encode(address(owner)), 8);
  vault.set(encoder.encode(address(LOCAL_USDC_MINT)), 40);
  vault.set(encoder.encode(address(ata)), 72);
  vault.writeUInt32LE(2, 104);
  vault[109] = bump;
  const clock = Buffer.alloc(40);
  clock.writeBigInt64LE(100n, 32);
  const token = Buffer.alloc(165);
  token.set(encoder.encode(address(LOCAL_USDC_MINT)));
  token.set(encoder.encode(address(vaultAddress)), 32);
  token.writeBigUInt64LE(99_960_000n, 64);
  const policy = async (agent: string) => {
    const [pubkey, policyBump] = await getProgramDerivedAddress({
      programAddress: address(programAddress),
      seeds: [
        Buffer.from('agent'),
        encoder.encode(address(vaultAddress)),
        encoder.encode(address(agent)),
      ],
    });
    const data = Buffer.alloc(POLICY_ACCOUNT_BYTES);
    data.set(disc('AgentPolicy'));
    data.set(encoder.encode(address(vaultAddress)), 8);
    data.set(encoder.encode(address(agent)), 40);
    data.writeBigUInt64LE(1_000_000n, 73);
    data.writeBigUInt64LE(5_000_000n, 81);
    data.writeBigInt64LE(86_400n, 89);
    data.writeBigInt64LE(1n, 113);
    data[134] = policyBump;
    return { pubkey, account: info(data, programAddress) };
  };
  const policies = [await policy(secondAgent), await policy(agentAddress)];
  const accounts = new Map([
    [vaultAddress, info(vault, programAddress)],
    [
      'SysvarC1ock11111111111111111111111111111111',
      info(clock, 'Sysvar1111111111111111111111111111111111111'),
    ],
    [ata, info(token, TOKEN_PROGRAM)],
  ]);
  let genesis = DEVNET_GENESIS;
  const calls: Array<{ method: string; params: unknown[] }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input, init) => {
      const request = JSON.parse(init.body as string);
      calls.push(request);
      const result =
        request.method === 'getGenesisHash'
          ? genesis
          : request.method === 'getMultipleAccounts'
            ? {
                context: { slot: 11 },
                value: request.params[0].map((pubkey: string) => accounts.get(pubkey) ?? null),
              }
            : request.method === 'getProgramAccounts'
              ? { context: { slot: 12 }, value: policies }
              : null;
      return Response.json({ jsonrpc: '2.0', id: request.id, result });
    }),
  );
  return {
    metadata: { rpcUrl: 'http://127.0.0.1:8899', programAddress, vaultAddress, agentAddress },
    owner,
    secondAgent,
    policies,
    calls,
    setGenesis: (value: string) => {
      genesis = value;
    },
  };
}

describe('all local agent policy projection', () => {
  it('discovers all current-vault policies, preserves seed-first ordering and chain guards', async () => {
    const test = await fixture();
    const result = await Effect.runPromise(readLocalChain(test.metadata));
    expect(result.owner).toBe(test.owner);
    expect(result.balanceBaseUnits).toBe('99960000');
    expect(result.policies.map((policy) => policy.agentKey)).toEqual([
      test.metadata.agentAddress,
      test.secondAgent,
    ]);
    expect(result.policies[1]?.policyAddress).toBe(test.policies[0]?.pubkey);
    const request = test.calls.find((call) => call.method === 'getProgramAccounts');
    expect(request?.params[0]).toBe(programAddress);
    expect(request?.params[1]).toMatchObject({
      commitment: 'confirmed',
      minContextSlot: 11,
      withContext: true,
      filters: [
        { dataSize: POLICY_ACCOUNT_BYTES },
        {
          memcmp: { offset: 0, encoding: 'base64', bytes: disc('AgentPolicy').toString('base64') },
        },
        {
          memcmp: {
            offset: 8,
            encoding: 'base64',
            bytes: Buffer.from(encoder.encode(address(test.metadata.vaultAddress))).toString(
              'base64',
            ),
          },
        },
      ],
    });
  });

  it('reads a configured public RPC through the shared browser-safe network-prefix path', async () => {
    const test = await fixture();
    const result = await Effect.runPromise(
      readVaultState({
        rpcUrl: 'https://rpc.example.test',
        programAddress,
        vaultAddress: test.metadata.vaultAddress,
        mint: LOCAL_USDC_MINT,
        genesisHash: DEVNET_GENESIS.slice(0, 32),
        seededAgentAddress: test.metadata.agentAddress,
      }),
    );
    expect(result.genesisHash).toBe(DEVNET_GENESIS);
    expect(result.balanceBaseUnits).toBe('99960000');
    const agents = toWorkspaceAgents(result.policies, test.metadata.agentAddress);
    expect(agents.map((agent) => agent.name)).toEqual([
      'Local Agent',
      workspaceAgentName(test.secondAgent),
    ]);
    expect(agents[1]).toMatchObject({
      agentKey: test.secondAgent,
      maxPerTxBaseUnits: '1000000',
      windowLimitBaseUnits: '5000000',
    });
    expect(
      toWorkspaceAgents(result.policies).every((agent) => agent.name.startsWith('Agent ')),
    ).toBe(true);
  });

  it('uses the configured expected mint instead of silently reading local USDC', async () => {
    const test = await fixture();
    const mint = key(7);
    await expect(
      Effect.runPromise(
        readVaultState({
          rpcUrl: 'https://rpc.example.test',
          programAddress,
          vaultAddress: test.metadata.vaultAddress,
          mint,
          genesisHash: DEVNET_GENESIS.slice(0, 32),
        }),
      ),
    ).rejects.toMatchObject({ code: 'VAULT_READ_UNAVAILABLE' });
    const request = test.calls.find((call) => call.method === 'getMultipleAccounts');
    expect((request?.params[0] as string[])[2]).toBe(
      await findTokenAccount(test.metadata.vaultAddress, mint),
    );
  });

  it('keeps full local genesis verification stricter than the public network prefix', async () => {
    const test = await fixture();
    test.setGenesis(`${DEVNET_GENESIS.slice(0, -1)}C`);
    await expect(Effect.runPromise(readLocalChain(test.metadata))).rejects.toMatchObject({
      code: 'LOCAL_WORKSPACE_UNAVAILABLE',
    });
    expect(test.calls.map((call) => call.method)).toEqual(['getGenesisHash']);
  });

  it.each(['owner', 'size', 'discriminator', 'vault', 'pda', 'bump'] as const)(
    'refuses a returned policy with invalid %s instead of trusting RPC filters',
    async (invalid) => {
      const test = await fixture();
      const entry = test.policies[0]!;
      const data = Buffer.from(entry.account.data[0]!, 'base64');
      if (invalid === 'owner') entry.account.owner = TOKEN_PROGRAM;
      if (invalid === 'size') entry.account.data[0] = data.subarray(1).toString('base64');
      if (invalid === 'discriminator') data[0] = data[0]! ^ 1;
      if (invalid === 'vault') data.set(encoder.encode(address(key(9))), 8);
      if (invalid === 'pda') entry.pubkey = address(key(8));
      if (invalid === 'bump') data[134] = data[134]! ^ 1;
      if (invalid !== 'size') entry.account.data[0] = data.toString('base64');
      await expect(Effect.runPromise(readLocalChain(test.metadata))).rejects.toMatchObject({
        code: 'LOCAL_WORKSPACE_UNAVAILABLE',
      });
    },
  );

  it('fails closed on another chain before querying vault or policy accounts', async () => {
    const test = await fixture();
    test.setGenesis('another-genesis');
    await expect(Effect.runPromise(readLocalChain(test.metadata))).rejects.toMatchObject({
      code: 'LOCAL_WORKSPACE_UNAVAILABLE',
    });
    expect(test.calls.map((call) => call.method)).toEqual(['getGenesisHash']);
  });
});
