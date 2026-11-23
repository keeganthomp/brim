import { Buffer } from 'node:buffer';
import { address, generateKeyPairSigner, getAddressEncoder } from '@solana/kit';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIM_DEVELOPMENT_PROGRAM_ADDRESS } from '@brim/sdk';
const state = vi.hoisted(() => ({
  data: null as string | null,
  count: 0,
  uncertain: false,
  rejected: false,
  prepared: vi.fn(),
  submitted: vi.fn(),
}));
const vault = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
vi.mock('./local-policy-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./local-policy-owner')>();
  return {
    ...actual,
    localPolicyOwner: Effect.sync(() => ({
      config: {
        rpcUrl: 'http://127.0.0.1:8899',
        vaultAddress: vault,
        programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
      },
      owner: { address: 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB' },
      client: {
        rpcEffect: (method: string) =>
          Effect.sync(() => {
            if (method === 'getAccountInfo')
              return {
                value: state.data
                  ? {
                      owner: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
                      executable: false,
                      data: [state.data, 'base64'],
                    }
                  : null,
              };
            if (method === 'getProgramAccounts')
              return Array.from({ length: state.count }, () => ({ pubkey: vault }));
            if (method === 'getSignatureStatuses') return { value: [null] };
            if (method === 'getBlockHeight') return 10;
            throw new Error('Unexpected mock RPC');
          }),
        prepareEffect: (_owner: unknown, instructions: unknown) =>
          Effect.sync(() => {
            state.prepared(instructions);
            return {
              wire: 'fake-local-wire',
              signature: '2'.repeat(88),
              lastValidBlockHeight: 100n,
            };
          }),
        submitEffect: () =>
          Effect.suspend(() => {
            state.submitted();
            return state.uncertain
              ? Effect.fail(new Error('private-provider-detail'))
              : Effect.succeed('2'.repeat(88));
          }),
        confirmEffect: () =>
          state.rejected
            ? Effect.fail({ _tag: 'LocalTransactionError' })
            : Effect.succeed('2'.repeat(88)),
      },
    })),
  };
});
import { localPolicies } from './local-policies';
let input: {
  intent: string;
  agentKey: string;
  maxPerTxBaseUnits: string;
  windowLimitBaseUnits: string;
  minTxInterval: number;
  allowlistEnabled: boolean;
  allowlist: string[];
};
const post = () =>
  Effect.runPromise(
    localPolicies(
      new Request('http://0.0.0.0:3000/api/local/policies', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      }),
    ),
  );
beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('BRIM_LOCAL_CONFIG', '/generated/local.json');
  state.data = null;
  state.count = 0;
  state.uncertain = false;
  state.rejected = false;
  state.prepared.mockClear();
  state.submitted.mockClear();
  input = {
    intent: 'create',
    agentKey: (await generateKeyPairSigner()).address,
    maxPerTxBaseUnits: '250000',
    windowLimitBaseUnits: '2000000',
    minTxInterval: 7,
    allowlistEnabled: true,
    allowlist: [],
  };
});
afterEach(() => vi.unstubAllEnvs());
function existingPolicy() {
  const bytes = Buffer.alloc(647);
  bytes.set([148, 193, 218, 129, 21, 96, 195, 77]);
  const encoder = getAddressEncoder();
  bytes.set(encoder.encode(address(vault)), 8);
  bytes.set(encoder.encode(address(input.agentKey)), 40);
  bytes[72] = 1;
  bytes.writeBigInt64LE(3600n, 89);
  bytes.writeBigUInt64LE(500n, 105);
  return bytes.toString('base64');
}
describe('local policy mutation state machine', () => {
  it('refuses create over an existing policy before signing', async () => {
    state.data = existingPolicy();
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'POLICY_EXISTS' });
    expect(state.prepared).not.toHaveBeenCalled();
  });
  it('requires an existing policy for update', async () => {
    input.intent = 'update';
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'POLICY_MISSING' });
    expect(state.prepared).not.toHaveBeenCalled();
  });
  it('preserves existing duration and exact spacing in update instruction data', async () => {
    input.intent = 'update';
    state.data = existingPolicy();
    const response = await post();
    expect(response.status).toBe(200);
    const instructions = state.prepared.mock.calls[0]![0] as { data: Uint8Array }[];
    const data = Buffer.from(instructions[0]!.data);
    expect(data.readBigInt64LE(56)).toBe(3600n);
    expect(data.readBigInt64LE(64)).toBe(7n);
    expect(await response.json()).toMatchObject({
      status: 'confirmed',
      windowDuration: '3600',
      created: false,
    });
  });
  it('caps new registrations before constructing an owner transaction', async () => {
    state.count = 100;
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'POLICY_LIMIT_REACHED' });
    expect(state.prepared).not.toHaveBeenCalled();
  });
  it('retains an uncertain signature and refuses to sign a replacement until reconciled', async () => {
    state.uncertain = true;
    const first = await post();
    expect(first.status).toBe(202);
    const text = await first.text();
    expect(text).toContain('CONFIRMATION_PENDING');
    expect(text).not.toContain('private-provider-detail');
    input.maxPerTxBaseUnits = '200000';
    const second = await post();
    expect(second.status).toBe(202);
    expect(state.prepared).toHaveBeenCalledTimes(1);
    expect(state.submitted).toHaveBeenCalledTimes(1);
  });
  it('reports a confirmed runtime rejection as failure', async () => {
    state.rejected = true;
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'POLICY_REJECTED' });
  });
});
