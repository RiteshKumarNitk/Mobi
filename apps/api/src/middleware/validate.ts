import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { BadRequest } from "../lib/errors";

export function validate(schema: ZodSchema, source: "body" | "query" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === "body" ? req.body : req.query);
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return next(BadRequest(message, "VALIDATION"));
    }
    if (source === "body") req.body = result.data;
    else (req as any).validatedQuery = result.data;
    next();
  };
}
