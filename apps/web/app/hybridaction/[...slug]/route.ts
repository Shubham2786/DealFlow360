// Fast discard for browser extension tracker pings (e.g. Baidu / Zyb / translation extensions)
// Prevents browser extensions from flooding and blocking the Next.js dev server.
export async function GET() {
  return new Response(null, { status: 204 });
}

export async function POST() {
  return new Response(null, { status: 204 });
}
