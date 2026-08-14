import type { Request, Response, NextFunction } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export const asyncH = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
