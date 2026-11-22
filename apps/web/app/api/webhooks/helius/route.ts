import { Effect } from 'effect';
import { ingestWebhook } from '../../../../server/ingestion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (request: Request) => Effect.runPromise(ingestWebhook(request));
