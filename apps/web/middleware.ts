import { NextResponse, type NextRequest } from "next/server";

function allowedOrigin(origin: string | null) {
  const configured = process.env.CORS_ORIGINS ?? "*";
  const origins = configured.split(",").map((entry) => entry.trim().replace(/\/$/, ""));
  if (origins.includes("*")) return "*";
  if (!origin) return null;
  const matches = origins.some((entry) => {
    const pattern = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+");
    return new RegExp(`^${pattern}$`, "i").test(origin);
  });
  return matches ? origin : null;
}

export function middleware(request: NextRequest) {
  const response = request.method === "OPTIONS"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();
  const origin = allowedOrigin(request.headers.get("origin"));

  response.headers.append("Vary", "Origin");
  if (origin) response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-device-id, x-request-id");
  response.headers.set("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
  return response;
}

export const config = { matcher: "/api/:path*" };
