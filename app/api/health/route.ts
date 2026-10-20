export function GET() {
  return Response.json({ status: 'ok', application: 'jdtool' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
