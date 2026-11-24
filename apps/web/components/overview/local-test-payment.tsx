import { LoaderCircle } from 'lucide-react';

export interface LocalPaymentAction {
  available: boolean;
  busy: boolean;
  result?: { signature: string; amount: string } | undefined;
  error?: string | undefined;
  run: () => void | Promise<void>;
}

/** The action runs a real local request; success comes only from the returned settlement. */
export function LocalTestPayment({ payment }: { payment: LocalPaymentAction }) {
  return (
    <div className="local-test-payment">
      <button
        className="button vault-primary"
        disabled={!payment.available || payment.busy}
        aria-busy={payment.busy}
        onClick={() => void payment.run()}
      >
        {payment.busy && <LoaderCircle className="busy-indicator" size={14} aria-hidden="true" />}
        {payment.busy ? 'Making payment…' : 'Make test payment'}
      </button>
      <div className="local-payment-status" aria-live="polite" aria-atomic="true">
        {!payment.busy && payment.error ? (
          <p className="local-payment-error" role="alert">
            {payment.error}
          </p>
        ) : !payment.busy && payment.result ? (
          <p className="local-payment-settled">Settled · {payment.result.amount}</p>
        ) : (
          <p>{payment.busy ? 'Payment in progress.' : 'A paid API request using test USDC.'}</p>
        )}
      </div>
    </div>
  );
}
