import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { signAccess, signRefresh } from "./jwt";

/** Expiry of a freshly signed refresh token, read from the token itself so it always matches JWT_REFRESH_EXPIRES_IN. */
function expiryOf(token: string): Date {
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
}

export async function issueTokens(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accessToken = signAccess({ id: user.id, role: user.role });
  const refreshToken = signRefresh(user.id);
  await prisma.refreshToken.create({
    data: { userId, token: refreshToken, expiresAt: expiryOf(refreshToken) },
  });
  return { accessToken, refreshToken };
}

export async function revokeUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
}

/**
 * Atomically consume a refresh token. Returns false when it was already used:
 * a replayed refresh token means it leaked, so every session of that user is
 * revoked (refresh-token reuse detection).
 */
export async function consumeRefreshToken(id: string, userId: string): Promise<boolean> {
  const { count } = await prisma.refreshToken.updateMany({ where: { id, revoked: false }, data: { revoked: true } });
  if (count === 1) return true;
  await revokeUserTokens(userId);
  return false;
}
