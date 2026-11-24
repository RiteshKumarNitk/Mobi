import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { babaPrisma?: PrismaClient };

export const prisma = globalForPrisma.babaPrisma ??= new PrismaClient();
