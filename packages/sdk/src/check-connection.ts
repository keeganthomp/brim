import { address } from '@solana/kit';
import { Effect } from 'effect';
import { attempt, fromPromise, run } from './effects.js';
import { BrimPolicyViolationError, fail } from './errors.js';
import { readBrimVaultConfig } from './vault-config.js';
import { resolveBrimRpcUrl } from './rpc.js';
import { checkPolicy } from './policy.js';
import { findTokenAccount } from './accounts.js';
import { TOKEN_PROGRAM } from './constants.js';
import { readConnectionState } from './check-state.js';
import { probeMerchant } from './check-merchant.js';
import type {
  BrimConnectionInput,
  BrimConnectionIssue,
  BrimConnectionReport,
} from './check-connection-types.js';
export type {
  BrimConnectionInput,
  BrimConnectionIssue,
  BrimConnectionPolicy,
  BrimMerchantCheck,
  BrimConnectionReport,
} from './check-connection-types.js';

/** No key loading, signing, broadcasting, payment authorization, or resource body reads. */
export function checkBrimConnectionEffect(
  input: BrimConnectionInput,
): Effect.Effect<BrimConnectionReport, BrimPolicyViolationError> {
  return Effect.gen(function* () {
    const config = yield* attempt(
      () => {
        const details = readBrimVaultConfig(input.vaultConfig);
        address(input.agentPublicKey);
        if (input.fetch !== undefined && typeof input.fetch !== 'function')
          fail('INVALID_CONFIG', 'Provide a fetch function for the optional resource check.');
        if (input.resourceUrl !== undefined) {
          const url = new URL(input.resourceUrl);
          if (
            input.resourceUrl.length > 4096 ||
            url.username ||
            url.password ||
            (url.protocol !== 'https:' &&
              !(
                url.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
              ))
          )
            fail('INVALID_CONFIG', 'Use an HTTPS resource URL, or localhost for development.');
        }
        return {
          details,
          rpcUrl: resolveBrimRpcUrl(details.network, input.rpcUrl),
          agentPublicKey: input.agentPublicKey,
          resourceUrl: input.resourceUrl,
          transport: input.fetch ?? globalThis.fetch,
        };
      },
      'INVALID_CONFIG',
      'Provide a valid vault config, agent public key, and connection URL.',
    );
    const state = yield* readConnectionState(config.details, config.agentPublicKey, config.rpcUrl);
    const blockers: BrimConnectionIssue[] = [];
    const add = (issue: BrimConnectionIssue) => {
      if (!blockers.some((item) => item.code === issue.code)) blockers.push(issue);
    };
    const policy = state.policy;
    const spent =
      policy && state.now - policy.windowStart < policy.windowDuration ? policy.windowSpent : 0n;
    const remaining = policy && policy.windowLimit > spent ? policy.windowLimit - spent : 0n;
    const hasPrevious = policy && (policy.lastTxTs !== 0n || policy.windowSpent !== 0n);
    const nextAt =
      policy && hasPrevious && policy.lastTxTs + policy.minTxInterval > state.now
        ? policy.lastTxTs + policy.minTxInterval
        : state.now;
    if (state.vaultPaused) add({ code: 'VAULT_PAUSED', message: 'The vault is paused.' });
    if (!policy)
      add({
        code: 'POLICY_NOT_FOUND',
        message: 'Register this agent public key on the vault before it can spend.',
      });
    if (policy?.isFrozen) add({ code: 'AGENT_FROZEN', message: 'This agent policy is frozen.' });
    if (state.balance === 0n) add({ code: 'VAULT_EMPTY', message: 'The vault has no USDC.' });
    if (policy && remaining === 0n)
      add({
        code: 'WINDOW_LIMIT_EXCEEDED',
        message: 'The current spending window has no remaining budget.',
      });
    if (nextAt > state.now)
      add({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'The minimum payment interval has not elapsed.',
      });
    if (policy?.allowlistEnabled && policy.allowlist.length === 0)
      add({ code: 'RECIPIENT_NOT_ALLOWED', message: 'The policy has no approved recipients.' });
    const report: BrimConnectionReport = {
      network: config.details.network,
      vaultAddress: config.details.vaultAddress,
      agentPublicKey: config.agentPublicKey,
      policyAddress: state.policyAddress,
      vaultTokenAccount: state.vaultTokenAccount,
      mint: state.mint,
      balanceBaseUnits: state.balance.toString(),
      vaultPaused: state.vaultPaused,
      policy: policy
        ? {
            isFrozen: policy.isFrozen,
            maxPerTxBaseUnits: policy.maxPerTx.toString(),
            windowLimitBaseUnits: policy.windowLimit.toString(),
            windowRemainingBaseUnits: remaining.toString(),
            minTxIntervalSeconds: policy.minTxInterval.toString(),
            nextPaymentAt: nextAt.toString(),
          }
        : null,
      ready: false,
      blockers,
    };
    if (config.resourceUrl !== undefined) {
      const { merchant, payment } = yield* probeMerchant(
        config.details,
        config.resourceUrl,
        config.transport,
      );
      report.merchant = merchant;
      if (payment) {
        const recipientTokenAccount = yield* fromPromise(
          () => findTokenAccount(payment.recipient, payment.asset),
          'INVALID_PAYMENT_REQUIREMENTS',
          'The quoted recipient account could not be derived.',
        );
        if (
          payment.feePayer === config.agentPublicKey ||
          [
            config.details.programAddress,
            config.details.vaultAddress,
            state.policyAddress,
            state.vaultTokenAccount,
            state.mint,
            payment.recipient,
            recipientTokenAccount,
            TOKEN_PROGRAM,
            'ComputeBudget111111111111111111111111111111',
            'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
          ].includes(payment.feePayer)
        )
          add({
            code: 'UNTRUSTED_FEE_PAYER',
            message: 'The facilitator fee payer is not isolated from the payment accounts.',
          });
        if (payment.amount > state.balance)
          add({
            code: 'INSUFFICIENT_BALANCE',
            message: 'The vault balance cannot cover this quote.',
          });
        if (payment.amount > 1_000_000n)
          add({
            code: 'PER_TRANSACTION_LIMIT_EXCEEDED',
            message: 'The quote exceeds the SDK default $1 USDC safety cap.',
          });
        if (policy) {
          yield* attempt(
            () => {
              try {
                checkPolicy(
                  policy,
                  payment.amount,
                  payment.recipient,
                  state.now,
                  state.vaultPaused,
                );
              } catch (error) {
                if (error instanceof BrimPolicyViolationError)
                  add({ code: error.code, message: error.message });
                else throw error;
              }
            },
            'INVALID_ACCOUNT',
            'The quote could not be checked against this policy.',
          );
        }
      }
    }
    report.ready = blockers.length === 0;
    return report;
  }).pipe(
    Effect.timeoutOrElse({
      duration: 15_000,
      orElse: () =>
        Effect.fail(
          new BrimPolicyViolationError(
            'REQUEST_FAILED',
            'Connection check timed out. No payment was authorized.',
          ),
        ),
    }),
  );
}

/** Ordinary async facade. Optional cancellation aborts only read-only work. */
export function checkBrimConnection(
  input: BrimConnectionInput,
  options?: { signal?: AbortSignal },
): Promise<BrimConnectionReport> {
  return run(checkBrimConnectionEffect(input), options);
}
