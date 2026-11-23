import { Effect } from 'effect';
import { localPolicies } from '../../../../server/local-policies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => Effect.runPromise(localPolicies(request));
