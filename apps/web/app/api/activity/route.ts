import { Effect } from 'effect';
import { activityFeed } from '../../../server/activity-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => Effect.runPromise(activityFeed(request));
