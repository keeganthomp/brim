export function GET() {
  return Response.json(
    { service: 'brim', status: 'ok', dashboard: 'demo-or-unconfigured' },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
}
