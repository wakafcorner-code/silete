import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const getPrisma = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
  }

  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter, log: ["query"] });
};

export const prisma = globalForPrisma.prisma || getPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
