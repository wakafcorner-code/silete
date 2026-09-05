import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import fs from "fs";
import path from "path";

/**
 * Force load environment variables for Prisma on server
 */
function ensureEnvLoaded() {
  if (process.env.DATABASE_URL) return;
  try {
    const envFiles = [".env.local", ".env"];
    for (const file of envFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const [key, ...values] = trimmed.split("=");
            const k = key.trim();
            const v = values.join("=").replace(/^["'](.*)["']$/, "$1").trim();
            process.env[k] = v;
          }
        }
      }
    }
  } catch (e) { /* ignore */ }
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const getPrisma = () => {
  ensureEnvLoaded();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined. Please check your .env file.");
  }

  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter, log: ["query"] });
};

export const prisma = globalForPrisma.prisma || getPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
