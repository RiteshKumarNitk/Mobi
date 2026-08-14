import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env";

export function signAccess(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function signRefresh(userId: string) {
  // jti guarantees uniqueness even for two tokens issued in the same second
  return jwt.sign({ sub: userId, type: "refresh", jti: crypto.randomUUID() }, env.jwtSecret, {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
}
