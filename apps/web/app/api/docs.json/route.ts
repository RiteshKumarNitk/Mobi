import { env } from "@/lib/env";
import { NotFound } from "@/lib/errors";
import { openapiSpec } from "@/lib/openapi";
import { defineRoute } from "@/lib/route";

export const GET = defineRoute((_req, res) => {
  if (!env.apiDocsEnabled) throw NotFound("Endpoint not found");
  return res.json(openapiSpec);
});
