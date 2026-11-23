import {
  createUpsertAgentPolicyInstruction,
  decodeAgentPolicy,
  findBrimPolicyAddress,
} from '@brim/sdk';
import { Effect, Schema, Semaphore } from 'effect';
import { LocalWorkspaceError, MAX_LOCAL_AGENTS, POLICY_ACCOUNT_BYTES } from './local-schema';
import {
  LocalPolicyError,
  readPolicyInput,
  policyFailure,
  type PolicyInput,
} from './local-policy-input';
import {
  AccountResult,
  localPolicyOwner,
  policyAttempt,
  policyDecode,
  policyIo,
} from './local-policy-owner';

const mutex = Semaphore.makeUnsafe(1);
const pending = new Map<string, { signature: string; lastValidBlockHeight: bigint }>();
const SignatureStatuses = Schema.Struct({
  value: Schema.Array(
    Schema.NullOr(
      Schema.Struct({ err: Schema.Unknown, confirmationStatus: Schema.NullOr(Schema.String) }),
    ),
  ),
});
const BlockHeight = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const pendingFailure = (signature: string) =>
  new LocalPolicyError({ code: 'CONFIRMATION_PENDING', signature });
const runtimeRejected = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  error._tag === 'LocalTransactionError';

const register = (input: PolicyInput) =>
  Effect.gen(function* () {
    const { config, client, owner } = yield* localPolicyOwner;
    const reservation = `${config.rpcUrl}:${config.vaultAddress}:${input.agentKey}`;
    const earlier = pending.get(reservation);
    if (earlier) {
      const result = yield* policyDecode(
        SignatureStatuses,
        yield* client.rpcEffect('getSignatureStatuses', [
          [earlier.signature],
          { searchTransactionHistory: true },
        ]),
      );
      const status = result.value[0];
      if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus ?? '')) {
        pending.delete(reservation);
        if (status.err) return yield* new LocalPolicyError({ code: 'POLICY_REJECTED' });
      } else {
        const height = yield* policyDecode(
          BlockHeight,
          yield* client.rpcEffect('getBlockHeight', [{ commitment: 'confirmed' }]),
        );
        if (BigInt(height) <= earlier.lastValidBlockHeight)
          return yield* pendingFailure(earlier.signature);
        pending.delete(reservation);
      }
    }
    const policyAddress = yield* policyIo(() =>
      findBrimPolicyAddress(config.programAddress, config.vaultAddress, input.agentKey),
    );
    const existing = yield* policyDecode(
      AccountResult,
      yield* client.rpcEffect('getAccountInfo', [
        policyAddress,
        { encoding: 'base64', commitment: 'confirmed' },
      ]),
    );
    if (existing.value && input.intent === 'create')
      return yield* new LocalPolicyError({ code: 'POLICY_EXISTS' });
    if (!existing.value && input.intent === 'update')
      return yield* new LocalPolicyError({ code: 'POLICY_MISSING' });
    let duration = 86_400n;
    if (existing.value) {
      duration = yield* policyAttempt(() => {
        if (existing.value!.owner !== config.programAddress || existing.value!.executable)
          throw policyFailure();
        const state = decodeAgentPolicy(Buffer.from(existing.value!.data[0], 'base64'));
        if (
          state.vault !== config.vaultAddress ||
          state.agentKey !== input.agentKey ||
          state.windowDuration <= 0n
        )
          throw policyFailure();
        return state.windowDuration;
      });
    } else {
      const accounts = yield* policyDecode(
        Schema.Array(Schema.Struct({ pubkey: Schema.String })),
        yield* client.rpcEffect('getProgramAccounts', [
          config.programAddress,
          {
            encoding: 'base64',
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { dataSize: POLICY_ACCOUNT_BYTES },
              { memcmp: { offset: 8, bytes: config.vaultAddress } },
            ],
            commitment: 'confirmed',
          },
        ]),
      );
      if (accounts.length + pending.size >= MAX_LOCAL_AGENTS)
        return yield* new LocalPolicyError({ code: 'POLICY_LIMIT_REACHED' });
    }
    const { instruction } = yield* createUpsertAgentPolicyInstruction({
      programAddress: config.programAddress,
      vaultAddress: config.vaultAddress,
      ownerAddress: owner.address,
      agentKey: input.agentKey,
      limits: {
        maxPerTx: BigInt(input.maxPerTxBaseUnits),
        windowLimit: BigInt(input.windowLimitBaseUnits),
        windowDuration: duration,
        minTxInterval: BigInt(input.minTxInterval),
        allowlistEnabled: input.allowlistEnabled,
        allowlist: input.allowlist,
      },
    }).pipe(Effect.mapError(policyFailure));
    const prepared = yield* client
      .prepareEffect(owner, [instruction])
      .pipe(Effect.mapError(policyFailure));
    pending.set(reservation, {
      signature: prepared.signature,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    });
    yield* client
      .submitEffect(prepared)
      .pipe(Effect.mapError(() => pendingFailure(prepared.signature)));
    yield* client.confirmEffect(prepared.signature).pipe(
      Effect.timeout(10_000),
      Effect.mapError((error) => {
        if (runtimeRejected(error)) {
          pending.delete(reservation);
          return new LocalPolicyError({ code: 'POLICY_REJECTED' });
        }
        return pendingFailure(prepared.signature);
      }),
    );
    pending.delete(reservation);
    return Response.json(
      {
        status: 'confirmed',
        agentKey: input.agentKey,
        policyAddress,
        signature: prepared.signature,
        windowDuration: duration.toString(),
        created: input.intent === 'create',
      },
      { status: input.intent === 'create' ? 201 : 200, headers },
    );
  });
const errorStatus: Record<LocalPolicyError['code'], number> = {
  INVALID_POLICY: 400,
  POLICY_EXISTS: 409,
  POLICY_MISSING: 409,
  POLICY_LIMIT_REACHED: 409,
  LOCAL_POLICY_UNAVAILABLE: 503,
  POLICY_REJECTED: 409,
  CONFIRMATION_PENDING: 202,
};
const failureResponse = (error: unknown) => {
  const code =
    error instanceof LocalWorkspaceError
      ? error.code
      : error instanceof LocalPolicyError
        ? error.code
        : 'LOCAL_POLICY_UNAVAILABLE';
  return Response.json(
    {
      code,
      ...(error instanceof LocalPolicyError &&
      error.code === 'CONFIRMATION_PENDING' &&
      error.signature
        ? { signature: error.signature }
        : {}),
    },
    {
      status: code === 'LOCAL_ONLY' ? 404 : (errorStatus[code as LocalPolicyError['code']] ?? 503),
      headers,
    },
  );
};
export const localPolicies = (request: Request) =>
  Effect.gen(function* () {
    const input = yield* readPolicyInput(request).pipe(Effect.timeout(5_000));
    return yield* mutex.withPermit(register(input));
  }).pipe(Effect.catch((error) => Effect.succeed(failureResponse(error))));
