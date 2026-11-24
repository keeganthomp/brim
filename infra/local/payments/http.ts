/** Thin Node HTTP adapter around the official x402 protocol implementation. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Effect } from 'effect';
import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  x402HTTPResourceServer,
} from '@x402/core/server';
import { LocalSetupError } from '../../../scripts/local/config.ts';
import type { SettlementObserver } from './ledger.ts';

const failure = () =>
  new LocalSetupError({ message: 'Local x402 request could not be completed.' });
function send(response: ServerResponse, instruction: HTTPResponseInstructions) {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const [name, value] of Object.entries(instruction.headers)) headers.set(name, value);
  response.writeHead(instruction.status, Object.fromEntries(headers));
  response.end(
    instruction.body === undefined
      ? ''
      : instruction.isHtml
        ? String(instruction.body)
        : JSON.stringify(instruction.body),
  );
}
function requestContext(request: IncomingMessage): HTTPRequestContext {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4020');
  const header = (name: string) => {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value.join(',') : value;
  };
  const adapter: HTTPAdapter = {
    getHeader: header,
    getMethod: () => request.method ?? 'GET',
    getPath: () => url.pathname,
    getUrl: () => url.href,
    getAcceptHeader: () => header('accept') ?? '',
    getUserAgent: () => header('user-agent') ?? '',
  };
  const paymentHeader = header('payment-signature');
  return {
    adapter,
    path: url.pathname,
    method: adapter.getMethod(),
    ...(paymentHeader === undefined ? {} : { paymentHeader }),
  };
}

export function handleLocalRequest(
  resource: x402HTTPResourceServer,
  request: IncomingMessage,
  response: ServerResponse,
  recordSettlement?: SettlementObserver,
) {
  return Effect.gen(function* () {
    const context = requestContext(request);
    if (context.path === '/health' && context.method === 'GET')
      return send(response, {
        status: 200,
        headers: {},
        body: { status: 'ok', mode: 'local-only' },
      });
    if (context.path !== '/report' || context.method !== 'GET')
      return send(response, { status: 404, headers: {}, body: { code: 'NOT_FOUND' } });
    const result = yield* Effect.tryPromise({
      try: () => resource.processHTTPRequest(context),
      catch: failure,
    });
    if (result.type === 'payment-error') return send(response, result.response);
    if (result.type !== 'payment-verified')
      return send(response, { status: 503, headers: {}, body: { code: 'PAYMENT_REQUIRED' } });
    const body = {
      report: 'Your local Brim agent paid for this report.',
      mode: 'local-only',
      price: '0.04',
      currency: 'USDC',
    };
    const settlement = yield* Effect.tryPromise({
      try: () =>
        resource.processSettlement(
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          { request: context, responseBody: Buffer.from(JSON.stringify(body)) },
          undefined,
          result.beforeHandlerSettlement,
        ),
      catch: failure,
    });
    if (!settlement.success) return send(response, settlement.response);
    if (recordSettlement) {
      const captured = yield* recordSettlement(settlement).pipe(Effect.result);
      // The chain may already be settled. Preserve its receipt even if local durable capture fails.
      if (captured._tag === 'Failure')
        return send(response, {
          status: 503,
          headers: settlement.headers,
          body: {
            code: 'SETTLED_INDEXING_UNAVAILABLE',
            message: 'Payment may be settled. Reconcile its receipt before retrying.',
          },
        });
    }
    return send(response, { status: 200, headers: settlement.headers, body });
  }).pipe(
    Effect.catch(() =>
      Effect.sync(() => {
        if (!response.headersSent)
          send(response, { status: 503, headers: {}, body: { code: 'LOCAL_PAYMENT_UNAVAILABLE' } });
        else response.end();
      }),
    ),
  );
}
