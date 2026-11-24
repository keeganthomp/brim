import assert from 'node:assert/strict';

const site = process.env.BRIM_SITE_URL;
const app = process.env.BRIM_APP_URL;
assert.ok(site && app, 'BRIM_SITE_URL and BRIM_APP_URL are required');

async function check(origin, path, status, options) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(60_000),
    ...options,
  });
  assert.equal(response.status, status, `${path}: expected ${status}, got ${response.status}`);
  console.log(`${response.status} ${origin}${path}`);
  return response;
}

const landing = await (await check(site, '/', 200)).text();
assert.ok(landing.includes(app), 'Marketing site must link to the deployed dashboard');
for (const path of [
  '/why-brim/',
  '/docs/',
  '/docs/sdk/',
  '/docs/mcp/',
  '/llms.txt',
  '/llms-full.txt',
]) {
  await check(site, path, 200);
}
const search = await (await check(site, '/docs/search-index.json', 200)).json();
assert.equal(search.type, 'advanced');
assert.ok(search.docs?.count > 0, 'Docs search index must contain pages');
await check(site, '/this-page-does-not-exist', 404);
const dashboard = await (await check(app, '/', 200)).text();
assert.ok(dashboard.includes('Demo workspace'), 'Dashboard must expose demo mode');
const health = await (await check(app, '/api/health', 200)).json();
assert.equal(health.status, 'ok');
await check(app, '/api/local/workspace', 404);
await check(app, '/api/local/policies', 404, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
await check(app, '/api/local/test-payment', 404, { method: 'POST' });
await check(app, '/api/activity', 404);
await check(app, '/api/webhooks/helius', 503, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '[]',
});
console.log('Deployment checks passed. Local writes and unconfigured ingestion are disabled.');
