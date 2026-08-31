/**
 * PRODUCTION DATABASE RESTORE UTILITY — ERP MANAJEMEN
 *
 * Restores the MySQL / MariaDB database from an SQL dump file,
 * executing statements with foreign key constraint handling and verification.
 */

import * as mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// ─── Load Environment ─────────────────────────────────────────────────────────
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const p = path.join(process.cwd(), file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("#") && t.includes("=")) {
          const [key, ...vals] = t.split("=");
          const value = vals.join("=").replace(/^["'](.*?)["']$/, "$1");
          if (!process.env[key.trim()]) process.env[key.trim()] = value;
        }
      }
    }
  }
}
loadEnv();

export async function restoreDatabase(backupFilePath: string): Promise<{
  restoredTables: number;
  totalStatements: number;
}> {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3307"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "erp_manajemen",
    multipleStatements: true,
    decimalNumbers: true,
  });

  const sqlContent = fs.readFileSync(backupFilePath, "utf-8");

  // Execute full script
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");
    await conn.query(sqlContent);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
  } finally {
    conn.release();
  }

  const [tables] = await pool.execute<mysql.RowDataPacket[]>("SHOW TABLES");
  await pool.end();

  return {
    restoredTables: tables.length,
    totalStatements: sqlContent.split(";").length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const targetFile = args[0];

  if (!targetFile) {
    console.error("Usage: tsx scripts/restore-db.ts <path-to-sql-file>");
    process.exit(1);
  }

  console.log(`Starting database restore from: ${targetFile}...`);
  restoreDatabase(targetFile)
    .then((res) => {
      console.log(`✅ Restore completed successfully!`);
      console.log(`   Tables restored: ${res.restoredTables}`);
    })
    .catch((err) => {
      console.error("❌ Restore failed:", err);
      process.exit(1);
    });
}
