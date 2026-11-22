import { Schema } from 'effect';
import { AdvancedConfigSchema, PaymentBoundarySchema } from './schemas.js';
import type { PaymentRequirements } from '@x402/core/types';
import { NETWORKS } from './constants.js';
import { fail } from './errors.js';
import { parseAtomicAmount } from './policy.js';
import type { BrimConfig, ResolvedBrimConfig, ValidatedPayment } from './types.js';

export function validateConfig(config: ResolvedBrimConfig): void {
  try {
    Schema.decodeUnknownSync(AdvancedConfigSchema)(config);
  } catch {
    fail('INVALID_CONFIG', 'Provide a valid public vault config (Brim card) and scoped agent key.');
  }
}
export function validatePaymentRequirements(
  config: BrimConfig,
  req: PaymentRequirements,
): ValidatedPayment {
  try {
    Schema.decodeUnknownSync(PaymentBoundarySchema)(req);
  } catch {
    fail(
      'INVALID_PAYMENT_REQUIREMENTS',
      'The merchant sent invalid payment details. Ask it for a valid Solana USDC offer.',
    );
  }
  if (
    req.scheme !== 'exact' ||
    req.network !== config.network ||
    req.asset !== NETWORKS[config.network].mint
  )
    fail(
      'UNSUPPORTED_PAYMENT',
      'Only exact USDC payments on the configured Solana network are supported.',
    );
  const amount = parseAtomicAmount(req.amount);
  if (amount > (config.maxPaymentAmount ?? 1_000_000n))
    fail(
      'PER_TRANSACTION_LIMIT_EXCEEDED',
      'Payment exceeds the SDK safety cap ($1 USDC by default). Pass maxPaymentAmount in USDC base units to raise it.',
    );
  const feePayer = req.extra?.feePayer;
  if (typeof feePayer !== 'string' || !config.facilitator.feePayers.includes(feePayer))
    fail('UNTRUSTED_FEE_PAYER', 'Server advertised an untrusted facilitator fee payer.');
  const versions = req.extra?.transactionVersions;
  if (versions !== undefined && (!Array.isArray(versions) || !versions.includes(0)))
    fail('UNSUPPORTED_PAYMENT', 'This SDK requires version-0 transaction support.');
  const memo = req.extra?.memo;
  if (
    memo !== undefined &&
    (typeof memo !== 'string' || new TextEncoder().encode(memo).length > 566)
  )
    fail('INVALID_PAYMENT_REQUIREMENTS', 'Memo is invalid or too long.');
  return {
    amount,
    asset: req.asset,
    recipient: req.payTo,
    feePayer,
    ...(memo === undefined ? {} : { memo: memo as string }),
  };
}
