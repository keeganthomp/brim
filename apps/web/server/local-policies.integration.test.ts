/** Explicit offline-only integration: BRIM_TEST_LOCAL_POLICIES=1 vitest run this file. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { address, createSolanaRpc, generateKeyPairSigner } from '@solana/kit';
import { decodeAgentPolicy } from '@brim/sdk';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localPolicies } from './local-policies';

const enabled = process.env.BRIM_TEST_LOCAL_POLICIES === '1';
describe.runIf(enabled)('generated-owner policy writes on offline Surfpool', () => {
  beforeAll(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv(
      'BRIM_LOCAL_CONFIG',
      path.resolve(process.env.BRIM_LOCAL_CONFIG ?? '.brim/local.json'),
    );
  });
  afterAll(() => vi.unstubAllEnvs());
  it('registers, reads back, prevents duplicate creation, and updates without resetting state', async () => {
    const config = JSON.parse(await readFile(process.env.BRIM_LOCAL_CONFIG!, 'utf8')) as {
      rpcUrl: string;
      merchantAddress: string;
    };
    const agent = await generateKeyPairSigner();
    const input = {
      intent: 'create',
      agentKey: agent.address,
      maxPerTxBaseUnits: '250000',
      windowLimitBaseUnits: '2000000',
      minTxInterval: 7,
      allowlistEnabled: true,
      allowlist: [config.merchantAddress],
    };
    const post = (body: unknown) =>
      Effect.runPromise(
        localPolicies(
          new Request('http://0.0.0.0:3000/api/local/policies', {
            method: 'POST',
            headers: {
              host: 'localhost:3000',
              origin: 'http://localhost:3000',
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
        ),
      );
    const response = await post(input);
    expect(response.status).toBe(201);
    const receipt = (await response.json()) as {
      policyAddress: string;
      agentKey: string;
      status: string;
    };
    expect(receipt.status).toBe('confirmed');
    expect(receipt.agentKey).toBe(agent.address);
    const rpc = createSolanaRpc(config.rpcUrl);
    const read = async () => {
      const result = await rpc
        .getAccountInfo(address(receipt.policyAddress), {
          encoding: 'base64',
          commitment: 'confirmed',
        })
        .send();
      expect(result.value).not.toBeNull();
      return decodeAgentPolicy(Buffer.from(result.value!.data[0], 'base64'));
    };
    const first = await read();
    expect(first.maxPerTx).toBe(250000n);
    expect(first.windowLimit).toBe(2000000n);
    expect(first.minTxInterval).toBe(7n);
    expect(first.windowDuration).toBe(86400n);
    const duplicate = await post({ ...input, maxPerTxBaseUnits: '200000' });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ code: 'POLICY_EXISTS' });
    expect((await read()).maxPerTx).toBe(250000n);
    const updated = await post({ ...input, intent: 'update', maxPerTxBaseUnits: '200000' });
    expect(updated.status).toBe(200);
    const next = await read();
    expect(next.maxPerTx).toBe(200000n);
    expect(next.minTxInterval).toBe(first.minTxInterval);
    expect(next.windowStart).toBe(first.windowStart);
    expect(next.windowSpent).toBe(first.windowSpent);
    expect(next.isFrozen).toBe(first.isFrozen);
    const missing = await generateKeyPairSigner();
    const absent = await post({ ...input, intent: 'update', agentKey: missing.address });
    expect(absent.status).toBe(409);
    expect(await absent.json()).toEqual({ code: 'POLICY_MISSING' });
  }, 30_000);
});
