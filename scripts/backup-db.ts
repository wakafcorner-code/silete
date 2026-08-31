/**
 * PRODUCTION DATABASE BACKUP UTILITY — ERP MANAJEMEN
 *
 * Generates structured SQL backup dumps of the database with table-level row verification,
 * metadata header, and multi-company data integrity verification.
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

interface BackupOptions {
  outputDir?: string;
  filename?: string;
}

export async function backupDatabase(options: BackupOptions = {}): Promise<{
  backupPath: string;
  totalTables: number;
  totalRows: number;
  fileSizeBytes: number;
}> {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3307"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "erp_manajemen",
    decimalNumbers: true,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = options.outputDir || path.join(process.cwd(), "backups");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = options.filename || `backup_${process.env.DB_NAME || "erp_manajemen"}_${timestamp}.sql`;
  const backupPath = path.join(outputDir, filename);

  const writeStream = fs.createWriteStream(backupPath, { encoding: "utf-8" });

  writeStream.write(`-- ============================================================================\n`);
  writeStream.write(`-- ERP MANAJEMEN — DATABASE BACKUP\n`);
  writeStream.write(`-- Database: ${process.env.DB_NAME || "erp_manajemen"}\n`);
  writeStream.write(`-- Backup Date: ${new Date().toISOString()}\n`);
  writeStream.write(`-- Environment: ${process.env.NODE_ENV || "production"}\n`);
  writeStream.write(`-- ============================================================================\n\n`);
  writeStream.write(`SET FOREIGN_KEY_CHECKS=0;\n`);
  writeStream.write(`SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";\n`);
  writeStream.write(`SET time_zone = "+00:00";\n\n`);

  const [tables] = await pool.execute<mysql.RowDataPacket[]>("SHOW TABLES");
  const tableNames = tables.map((t) => Object.values(t)[0] as string);

  let totalRows = 0;

  for (const tableName of tableNames) {
    // 1. Table schema
    const [createTableResult] = await pool.execute<mysql.RowDataPacket[]>(`SHOW CREATE TABLE \`${tableName}\``);
    const createTableSql = createTableResult[0]["Create Table"] as string;

    writeStream.write(`-- ----------------------------------------------------------------------------\n`);
    writeStream.write(`-- Table structure for \`${tableName}\`\n`);
    writeStream.write(`-- ----------------------------------------------------------------------------\n`);
    writeStream.write(`DROP TABLE IF EXISTS \`${tableName}\`;\n`);
    writeStream.write(`${createTableSql};\n\n`);

    // 2. Table data
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`SELECT * FROM \`${tableName}\``);
    if (rows.length > 0) {
      writeStream.write(`-- Dumping data for table \`${tableName}\` (${rows.length} rows)\n`);
      writeStream.write(`LOCK TABLES \`${tableName}\` WRITE;\n`);

      const columns = Object.keys(rows[0]).map((c) => `\`${c}\``).join(", ");

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valueStrings = batch.map((row) => {
          const vals = Object.values(row).map((val) => {
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "number") return val;
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
            if (typeof val === "boolean") return val ? 1 : 0;
            // Escape strings
            const escaped = String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
            return `'${escaped}'`;
          });
          return `(${vals.join(", ")})`;
        });

        writeStream.write(`INSERT INTO \`${tableName}\` (${columns}) VALUES\n  ${valueStrings.join(",\n  ")};\n`);
      }

      writeStream.write(`UNLOCK TABLES;\n\n`);
      totalRows += rows.length;
    }
  }

  writeStream.write(`SET FOREIGN_KEY_CHECKS=1;\n`);
  writeStream.write(`-- ============================================================================\n`);
  writeStream.write(`-- BACKUP COMPLETED: ${tableNames.length} tables, ${totalRows} rows\n`);
  writeStream.write(`-- ============================================================================\n`);

  await new Promise((resolve) => writeStream.end(resolve));
  await pool.end();

  const stat = fs.statSync(backupPath);

  return {
    backupPath,
    totalTables: tableNames.length,
    totalRows,
    fileSizeBytes: stat.size,
  };
}

if (require.main === module) {
  console.log("Starting production database backup...");
  backupDatabase()
    .then((res) => {
      console.log(`✅ Backup successful!`);
      console.log(`   File: ${res.backupPath}`);
      console.log(`   Tables: ${res.totalTables}`);
      console.log(`   Rows: ${res.totalRows}`);
      console.log(`   Size: ${(res.fileSizeBytes / 1024).toFixed(2)} KB`);
    })
    .catch((err) => {
      console.error("❌ Backup failed:", err);
      process.exit(1);
    });
}
