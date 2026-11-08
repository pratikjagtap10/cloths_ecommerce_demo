import { PrismaClient } from "../generated/client";

export { Prisma } from "../generated/client";

/** One Prisma client (with its connection pool) per process */
export const prisma = new PrismaClient();
