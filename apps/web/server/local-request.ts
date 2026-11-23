import { Effect } from 'effect';
import { isLoopback, LocalWorkspaceError } from './local-schema';

interface LocalAccess {
  environment: string | undefined;
  configured: boolean;
  method?: 'GET' | 'POST';
  requireOrigin?: boolean;
}
const denied = () => new LocalWorkspaceError({ code: 'LOCAL_ONLY' });

/** Next may normalize its internal URL to the bind address; validate the browser's Host instead. */
export const localRequest = (
  request: Request,
  access: LocalAccess = {
    environment: process.env.NODE_ENV,
    configured: Boolean(process.env.BRIM_LOCAL_CONFIG),
  },
) =>
  Effect.gen(function* () {
    if (
      access.environment !== 'development' ||
      !access.configured ||
      request.method !== (access.method ?? 'GET')
    ) {
      return yield* denied();
    }
    const host = yield* Effect.try({
      try: () => {
        const protocol = new URL(request.url).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') throw denied();
        return new URL(`${protocol}//${request.headers.get('host') ?? ''}`);
      },
      catch: denied,
    });
    if (
      !isLoopback(host.hostname) ||
      host.username ||
      host.password ||
      host.pathname !== '/' ||
      host.search ||
      host.hash
    ) {
      return yield* denied();
    }
    const origin = request.headers.get('origin');
    if (
      (access.requireOrigin && !origin) ||
      (origin && origin !== host.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    ) {
      return yield* denied();
    }
  });
