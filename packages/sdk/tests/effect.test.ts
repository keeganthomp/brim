import { Effect, Exit, Result } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrimVaultConfig,
  createBrimFetch,
  createBrimFetchEffect,
  BrimPolicyViolationError,
  validatePaymentRequirements,
} from '../src/index.js';
import { createSolanaPaymentAdapter } from '../src/solana.js';
import { config, req, vaultConfigDetails, fixture, paymentRequired } from './sharedfixtures.js';

describe('Effect runtime boundaries', () => {
  it('is lazy and exposes tagged failures through the typed error channel', async () => {
    const transport = vi.fn(async () => new Response('free'));
    const perform = createBrimFetchEffect({
      vaultConfig: createBrimVaultConfig(vaultConfigDetails),
      agentKey: '[]',
      rpcUrl: config.rpcUrl,
      fetch: transport,
    });
    const effect = perform('https://merchant.test/api');
    expect(transport).not.toHaveBeenCalled();
    expect(await (await Effect.runPromise(effect)).text()).toBe('free');
    const invalid = createBrimFetchEffect({
      vaultConfig: 'invalid-vaultConfig',
      agentKey: '[]',
      rpcUrl: config.rpcUrl,
    });
    const result = await Effect.runPromise(Effect.result(invalid('https://merchant.test/api')));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(BrimPolicyViolationError);
      expect(result.failure._tag).toBe('BrimPolicyViolationError');
      expect(result.failure.code).toBe('INVALID_CARD');
    }
  });
  it('interruption after signing aborts the workflow before any paid retry', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const transport = vi.fn(async () => paymentRequired());
    const perform = createBrimFetchEffect({
      ...f.config,
      fetch: transport,
      onEvent: (event) => {
        if (event.status === 'payment_signed') controller.abort();
      },
    });
    const exit = await Effect.runPromiseExit(perform('https://merchant.test/api'), {
      signal: controller.signal,
    });
    expect(Exit.isFailure(exit)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('sanitizes RPC failures without retaining RPC credentials in the cause', async () => {
    const f = await fixture();
    vi.stubGlobal('fetch', async () => {
      throw new Error('https://rpc.test?private-api-key=secret');
    });
    const result = await Effect.runPromise(
      Effect.result(
        createSolanaPaymentAdapter(f.config).createTransactionEffect(
          validatePaymentRequirements(f.config, req),
        ),
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe('RPC_UNAVAILABLE');
      expect(result.failure.message).not.toContain('secret');
      expect(result.failure.cause).toBeUndefined();
    }
  });
  it('reports unknown settlement after a paid transport failure without issuing another authorization', async () => {
    const f = await fixture();
    const observations: string[] = [];
    const transport = vi.fn(async () => {
      if (transport.mock.calls.length === 1) return paymentRequired();
      throw new Error('merchant failure with secret internal data');
    });
    try {
      await createBrimFetch({
        ...f.config,
        fetch: transport,
        onEvent: (event) => {
          observations.push(event.status);
        },
      })('https://merchant.test/api');
      throw new Error('expected payment failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BrimPolicyViolationError);
      expect(error).toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
      expect((error as Error).message).not.toContain('secret');
    }
    expect(transport).toHaveBeenCalledTimes(2);
    expect(observations).toEqual(['payment_signed']);
  });
});
