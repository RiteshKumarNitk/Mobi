/**
 * Set (or rotate) a user's password from the command line — used to replace
 * the seeded demo passwords before go-live, or to recover an admin account
 * when no SMS gateway is configured yet.
 *
 *   NEW_PASSWORD='…' npm run admin:set-password -w @baba/api -- 9999999999
 *
 * The password is read from the NEW_PASSWORD env var (not argv) so it does not
 * land in shell history or process listings. All of the user's refresh
 * tokens are revoked.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { passwordPolicyError } from "../src/lib/passwords";

async function main() {
  const phone = process.argv[2];
  const password = process.env.NEW_PASSWORD ?? "";
  if (!phone || !/^[0-9]{10,15}$/.test(phone)) {
    console.error("Usage: NEW_PASSWORD='…' npm run admin:set-password -w @baba/api -- <phone>");
    process.exit(1);
  }
  const policy = passwordPolicyError(password, { forbidDemo: true });
  if (policy) {
    console.error(`NEW_PASSWORD rejected: ${policy}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      console.error(`No user with phone ${phone}`);
      process.exit(1);
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
    ]);
    console.log(`Password updated for ${phone} (${user.role}); existing sessions revoked.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
