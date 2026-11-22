import { fail } from './errors.js';
import { validateChallengeHeader, validatePaidHeaders } from './payment-required.js';

export interface PaymentHandoff {
  signal: AbortSignal;
  dispatched: boolean;
}

/** One paid handoff only. Remote exception classes/messages never establish settlement. */
export function paymentTransport(transport: typeof fetch, handoff: PaymentHandoff): typeof fetch {
  return async (resource, options) => {
    handoff.signal.throwIfAborted();
    const outgoing = new Request(resource, { ...options, signal: handoff.signal });
    if (outgoing.headers.has('PAYMENT-SIGNATURE')) {
      if (handoff.dispatched)
        fail(
          'PAYMENT_OUTCOME_UNKNOWN',
          'Payment was already dispatched. Reconcile it before another authorization.',
        );
      handoff.dispatched = true;
    }
    let response: Response;
    try {
      response = await transport(outgoing);
    } catch {
      fail(
        handoff.dispatched ? 'PAYMENT_OUTCOME_UNKNOWN' : 'REQUEST_FAILED',
        handoff.dispatched
          ? 'Payment outcome is unknown. Check settlement before making another paid request.'
          : 'Request failed before payment was sent. Check the connection and try again.',
      );
    }
    if (handoff.dispatched) {
      try {
        validatePaidHeaders(response);
      } catch (error) {
        void response.body?.cancel().catch(() => {});
        throw error;
      }
    }
    if (response.status === 402 && !handoff.dispatched) {
      try {
        validateChallengeHeader(response);
      } catch (error) {
        void response.body?.cancel().catch(() => {});
        throw error;
      }
    }
    return response;
  };
}
