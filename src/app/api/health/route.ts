import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db-health";
import { verifyDatabaseSchema } from "@/lib/verify-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dbHealth = await checkDatabaseHealth();
    const schemaReport = await verifyDatabaseSchema();

    const isOverallHealthy = dbHealth.status === "HEALTHY" && schemaReport.isValid;

    return NextResponse.json(
      {
        status: isOverallHealthy ? "HEALTHY" : "DEGRADED",
        service: "SILETE API",
        version: "1.0.0",
        database: dbHealth,
        schema: {
          isValid: schemaReport.isValid,
          totalRequired: schemaReport.totalRequiredTables,
          found: schemaReport.existingTablesCount,
          foreignKeys: schemaReport.foreignKeyCount,
          missing: schemaReport.missingTables,
        },
        timestamp: new Date().toISOString(),
      },
      { status: isOverallHealthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "ERROR",
        message: error instanceof Error ? error.message : "Internal Server Error during health check",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
