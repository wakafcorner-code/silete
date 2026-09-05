import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import fs from "fs";
import path from "path";

/**
 * Load environment variables if in standalone script environment
 */
function ensureEnvLoaded() {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    try {
      const envFiles = [".env.local", ".env"];
      for (const file of envFiles) {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          console.log(`[ENV DEBUG] Force loading ${file}...`);
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
              const [key, ...values] = trimmed.split("=");
              const k = key.trim();
              const v = values.join("=").replace(/^["'](.*)["']$/, "$1").trim();

              // In dev, .env.local should OVERWRITE existing env vars to prevent cache issues
              process.env[k] = v;
            }
          }
        }
      }
    } catch (e) {
      console.error("[ENV DEBUG] Load failed:", e);
    }
  }
}

/**
 * Global database connection pool instance
 * Ensures singleton pattern across Next.js fast-refresh cycles
 */
interface GlobalWithMySQL {
  __mysqlPool?: Pool;
}

const globalForMySQL = globalThis as unknown as GlobalWithMySQL;

export function getPool(): Pool {
  if (globalForMySQL.__mysqlPool) {
    return globalForMySQL.__mysqlPool;
  }

  ensureEnvLoaded();

  const isDev = process.env.NODE_ENV !== "production";

  const dbUrl = process.env.DATABASE_URL;
  let parsedConfig: any = {};
  if (dbUrl && dbUrl.startsWith("mysql://")) {
    try {
      const url = new URL(dbUrl);
      parsedConfig = {
        host: url.hostname,
        port: url.port,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.substring(1),
      };
    } catch (e) { /* ignore */ }
  }

  // ROBUST LOCAL PRIORITY: FORCE ROOT IF ON LOCALHOST
  let host     = process.env.DB_HOST     || parsedConfig.host     || "localhost";
  let user     = process.env.DB_USER     || parsedConfig.user     || "root";
  let password = process.env.DB_PASSWORD || (process.env.DB_PASSWORD === "" ? "" : (parsedConfig.password || ""));
  let port     = process.env.DB_PORT     || parsedConfig.port     || (isDev ? "3307" : "3306");
  let database = process.env.DB_NAME     || parsedConfig.database || "erp_manajemen";

  // Production Emergency Fallback
  if (!isDev && !dbUrl) {
      host = "127.0.0.1";
      user = "erp_manajemen";
      password = "Mdwz4HCFzzKAz6Ah";
      port = "3306";
  }

  if (isDev && (host === "localhost" || host === "127.0.0.1")) {
      if (user === "erp_manajemen") {
          user = "root";
          password = "";
      }
  }

  console.log(`[DB INFO] Pool initializing for ${user}@${host}:${port} (DB: ${database})`);

  const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10);

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    decimalNumbers: true,
    timezone: "+07:00",
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  globalForMySQL.__mysqlPool = pool;
  return pool;
}

export type QueryParam = string | number | boolean | null | Date | Buffer;

/**
 * Execute a parameterized query returning rows
 */
export async function query<T = RowDataPacket[]>(
  sql: string,
  params: (QueryParam | undefined)[] = []
): Promise<T> {
  try {
    const currentPool = getPool();
    const sanitizedParams = params.map((p) => (p === undefined ? null : p));
    const [results] = await currentPool.execute<T extends RowDataPacket[] ? T : RowDataPacket[]>(
      sql,
      sanitizedParams as QueryParam[]
    );
    return results as unknown as T;
  } catch (error) {
    console.error("Database query error:", {
      sql,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute a query expecting a single row or null
 */
export async function queryOne<T>(
  sql: string,
  params: (QueryParam | undefined)[] = []
): Promise<T | null> {
  const rows = await query<RowDataPacket[]>(sql, params);
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0] as unknown as T;
}

/**
 * Execute an INSERT / UPDATE / DELETE mutation
 */
export async function execute(
  sql: string,
  params: (QueryParam | undefined)[] = []
): Promise<ResultSetHeader> {
  try {
    const currentPool = getPool();
    const sanitizedParams = params.map((p) => (p === undefined ? null : p));
    const [result] = await currentPool.execute<ResultSetHeader>(
      sql,
      sanitizedParams as QueryParam[]
    );
    return result;
  } catch (error) {
    console.error("Database execution error:", {
      sql,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute operations within an atomic database transaction
 */
export async function transaction<T>(
  callback: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const currentPool = getPool();
  const conn = await currentPool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    console.error("Database transaction rolled back due to error:", error);
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Get a raw pool connection for manual transaction management.
 * Caller is responsible for beginTransaction(), commit()/rollback(), and release().
 */
export async function getConnection(): Promise<PoolConnection> {
  const currentPool = getPool();
  return currentPool.getConnection();
}

