import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { localRequest } from './local-request';

const access = { environment: 'development', configured: true };
const request = (headers: HeadersInit = {}, method = 'GET') =>
  new Request('http://0.0.0.0:3000/api/local/workspace', {
    method,
    headers: { host: 'localhost:3000', ...headers },
  });
const run = (input: Request, options = access) => Effect.runPromise(localRequest(input, options));

describe('local workspace browser origin boundary', () => {
  it('accepts a loopback Host despite Next normalizing its internal bind address', async () => {
    await expect(run(request())).resolves.toBeUndefined();
    await expect(run(request({ origin: 'http://localhost:3000' }))).resolves.toBeUndefined();
    await expect(run(request({ host: '127.0.0.1:3000' }))).resolves.toBeUndefined();
  });
  it('never permits production, unconfigured mode or writes', async () => {
    await expect(run(request(), { ...access, environment: 'production' })).rejects.toMatchObject({
      code: 'LOCAL_ONLY',
    });
    await expect(run(request(), { ...access, configured: false })).rejects.toMatchObject({
      code: 'LOCAL_ONLY',
    });
    await expect(run(request({}, 'POST'))).rejects.toMatchObject({ code: 'LOCAL_ONLY' });
  });
  it('rejects cross-origin reads and browser cross-site fetches', async () => {
    await expect(run(request({ origin: 'https://attacker.invalid' }))).rejects.toMatchObject({
      code: 'LOCAL_ONLY',
    });
    await expect(run(request({ 'sec-fetch-site': 'cross-site' }))).rejects.toMatchObject({
      code: 'LOCAL_ONLY',
    });
    await expect(run(request({ origin: 'http://localhost:4000' }))).rejects.toMatchObject({
      code: 'LOCAL_ONLY',
    });
  });
  it.each([
    'attacker.invalid:3000',
    'localhost.attacker.invalid',
    'localhost:3000/path',
    'user@localhost:3000',
    'localhost:3000?query',
    '',
  ])('rejects rebinding and malformed Host: %s', async (host) => {
    await expect(run(request({ host }))).rejects.toMatchObject({ code: 'LOCAL_ONLY' });
  });
});
