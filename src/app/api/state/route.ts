export const runtime = "nodejs";

export async function GET() {
  const base = process.env.BRIDGE_URL || "http://127.0.0.1:5001";

  const r = await fetch(`${base}/state`, { cache: "no-store" });
  const data = await r.json();
  return Response.json(data);
}
