import { Effect } from 'effect';
import { readLocalContext, PAYMENT_AMOUNT } from '../../../infra/local/payments/context';
import { requestLocalReport, paymentFailure } from '../../../infra/local/payments/request-report';
import { localLedgerPool } from './local-workspace';
import { readVerifiedPayments } from './verified-feed';

/** A browser success is backed by the same finalized feed as Activity. */
export function localPaymentFlow(filename: string, rpcUrl: string) {
  return Effect.gen(function* () {
    const context = yield* readLocalContext(filename, rpcUrl);
    const pool = yield* localLedgerPool;
    const signature = yield* requestLocalReport(context);
    for (let attempt = 0; attempt < 30; attempt++) {
      const rows = (yield* readVerifiedPayments(pool, context.vaultAddress)).filter(
        (row) => row.signature === signature,
      );
      if (rows.length) {
        if (
          rows.length !== 1 ||
          rows[0]!.agentKey !== context.agentAddress ||
          rows[0]!.recipient !== context.merchantAddress ||
          rows[0]!.amountBaseUnits !== PAYMENT_AMOUNT.toString()
        )
          return yield* paymentFailure('The verified payment differs from the test request.');
        return { status: 'settled', amount: '$0.04', signature, ledgerRows: 1 };
      }
      yield* Effect.sleep('500 millis');
    }
    return yield* paymentFailure('The test payment is awaiting finality.');
  });
}
