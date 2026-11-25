import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { AuthUser } from "./auth";
import { ApiError, BadRequest } from "./errors";
import { logger } from "./logger";
import { productionConfigErrors } from "./env";

export interface ApiRequest {
  body: any;
  query: Record<string, string | string[]>;
  validatedQuery?: unknown;
  params: Record<string, string>;
  headers: Headers;
  method: string;
  path: string;
  ip?: string;
  user?: AuthUser;
}

export class ApiResponse {
  private headers = new Headers({ "Cache-Control": "no-store" });

  constructor(requestId: string) {
    this.headers.set("X-Request-Id", requestId);
  }

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  json(data: unknown, status = 200) {
    return Response.json(data, { status, headers: this.headers });
  }

  send(data: string | Buffer, status = 200) {
    const body = typeof data === "string" ? data : Uint8Array.from(data);
    return new Response(body, { status, headers: this.headers });
  }
}

type Guard = (req: ApiRequest, res: ApiResponse) => void | Response | Promise<void | Response>;
type Handler = (req: ApiRequest, res: ApiResponse) => Response | Promise<Response>;
type RouteArgs = [...Guard[], Handler];
type RouteContext = { params: Promise<Record<string, string>> };

async function parseBody(request: Request, rawBody: boolean) {
  if (!request.body) return rawBody ? Buffer.alloc(0) : {};
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const text = contentType === "text/csv" || contentType === "text/plain";
  if (!rawBody && !text && contentType !== "application/json") return {};

  const limit = (text && !rawBody ? 5 : 1) * 1024 * 1024;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, "Request body is too large", "PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, size);
  if (rawBody) return bytes;
  if (text) return bytes.toString("utf8");
  if (!bytes.length) return {};
  try {
    const body = JSON.parse(bytes.toString("utf8"));
    if (body === null || typeof body !== "object") throw new Error("Expected a JSON object or array");
    return body;
  } catch {
    throw BadRequest("Malformed JSON body", "BAD_JSON");
  }
}

function requestError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2025": return new ApiError(404, "Record not found", "NOT_FOUND");
      case "P2002": return new ApiError(409, "A record with these details already exists", "CONFLICT");
      case "P2003": return new ApiError(409, "This record is referenced by other data and cannot be removed", "IN_USE");
      case "P2023": return BadRequest("Malformed identifier", "BAD_ID");
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) return BadRequest("Invalid request parameters");
}

export function defineRoute(...steps: RouteArgs): (request: NextRequest, context: RouteContext) => Promise<Response>;
export function defineRoute(options: { rawBody: true }, ...steps: RouteArgs): (request: NextRequest, context: RouteContext) => Promise<Response>;
export function defineRoute(...steps: RouteArgs | [{ rawBody: true }, ...RouteArgs]) {
  const rawBody = typeof steps[0] === "object";
  const guards = steps.slice(rawBody ? 1 : 0, -1) as Guard[];
  const handler = steps.at(-1) as Handler;

  return async (request: NextRequest, context: RouteContext): Promise<Response> => {
    const incomingId = request.headers.get("x-request-id");
    const requestId = incomingId && /^[A-Za-z0-9._-]{1,64}$/.test(incomingId) ? incomingId : randomUUID();
    const res = new ApiResponse(requestId);
    const path = request.nextUrl.pathname;

    try {
      const problems = productionConfigErrors();
      if (problems.length) {
        logger.error("api_configuration", { problems });
        throw new ApiError(503, "API configuration is incomplete", "UNAVAILABLE");
      }
      const query: ApiRequest["query"] = Object.create(null);
      for (const [key, value] of request.nextUrl.searchParams) {
        const previous = query[key];
        query[key] = previous === undefined ? value : ([] as string[]).concat(previous, value);
      }
      // Vercel supplies this header at the edge. Use a shared bucket on other hosts.
      const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? undefined : undefined;
      const req: ApiRequest = {
        body: await parseBody(request, rawBody),
        query,
        params: await context.params,
        headers: request.headers,
        method: request.method,
        path,
        ip,
      };
      for (const guard of guards) {
        const response = await guard(req, res);
        if (response) return response;
      }
      return await handler(req, res);
    } catch (error) {
      // Never let a shared cache keep an error, even if the handler marked the response public.
      res.setHeader("Cache-Control", "no-store");
      const known = requestError(error);
      if (known) return res.json({ success: false, error: { code: known.code, message: known.message } }, known.status);
      logger.error("unhandled_error", { requestId, path, method: request.method, error: String(error) });
      return res.json({ success: false, error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
    }
  };
}
