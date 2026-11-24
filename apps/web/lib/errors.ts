export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "ERROR"
  ) {
    super(message);
  }
}

export const BadRequest = (msg: string, code = "BAD_REQUEST") => new ApiError(400, msg, code);
export const Unauthorized = (msg = "Authentication required") => new ApiError(401, msg, "UNAUTHORIZED");
export const Forbidden = (msg = "You do not have permission to do this") => new ApiError(403, msg, "FORBIDDEN");
export const NotFound = (msg = "Not found") => new ApiError(404, msg, "NOT_FOUND");
export const Conflict = (msg: string) => new ApiError(409, msg, "CONFLICT");
