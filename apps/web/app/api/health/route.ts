import { prisma } from "@/lib/prisma";

const startedAt = Date.now();
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      ok: true,
      service: "baba-api",
      status: "healthy",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      ts: Date.now(),
    }, { headers });
  } catch {
    return Response.json({ ok: false, service: "baba-api", status: "degraded", ts: Date.now() }, { status: 503, headers });
  }
}
