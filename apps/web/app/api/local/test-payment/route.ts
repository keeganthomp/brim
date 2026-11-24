import { Effect } from 'effect';
import { localTestPayment } from '../../../../server/local-test-payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (request: Request) => Effect.runPromise(localTestPayment(request));
