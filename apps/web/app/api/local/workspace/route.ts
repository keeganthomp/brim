import { Effect } from 'effect';
import { localWorkspace } from '../../../../server/local-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => Effect.runPromise(localWorkspace(request));
