import { prisma } from "./prisma";
import { env } from "./env";
import { signAccess, signRefresh } from "./jwt";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function issueTokens(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accessToken = signAccess({ id: user.id, role: user.role });
  const refreshToken = signRefresh(user.id);
  await prisma.refreshToken.create({
    data: { userId, token: refreshToken, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
  return { accessToken, refreshToken };
}

export async function revokeUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
}

export function refreshTokenTtl(): number {
  return parseInt(env.jwtRefreshExpiresIn, 10) || 30;
}
