import type { ApiRequest } from "./route";
import type { ZodSchema } from "zod";
import { BadRequest } from "./errors";

export function validate(schema: ZodSchema, source: "body" | "query" = "body") {
  return (req: ApiRequest) => {
    const result = schema.safeParse(source === "body" ? req.body : req.query);
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw BadRequest(message, "VALIDATION");
    }
    if (source === "body") req.body = result.data;
    else req.validatedQuery = result.data;
  };
}
