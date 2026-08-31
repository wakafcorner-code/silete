import { query, queryOne } from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";

export interface DatabaseHealthResult {
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  database: string;
  host: string;
  port: number;
  latencyMs: number;
  serverVersion?: string;
  tableCount?: number;
  error?: string;
  timestamp: string;
}

/**
 * Check the health of the MySQL / MariaDB connection
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const database = process.env.DB_NAME || "erp_manajemen";
  const start = performance.now();

  try {
    // 1. Run basic ping / version check
    const versionRow = await queryOne<{ version: string; now: Date }>(
      "SELECT VERSION() as version, NOW() as now"
    );

    // 2. Count tables in erp_manajemen
    const tableRows = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
      [database]
    );

    const latencyMs = Math.round(performance.now() - start);
    const tableCount = tableRows[0] ? Number((tableRows[0] as { count: number }).count) : 0;

    return {
      status: "HEALTHY",
      database,
      host,
      port,
      latencyMs,
      serverVersion: versionRow?.version,
      tableCount,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: "DOWN",
      database,
      host,
      port,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}
