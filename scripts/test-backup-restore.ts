/**
 * PHASE 18 — BACKUP & RESTORE VERIFICATION TEST SUITE
 *
 * Verifies:
 *  1. Backup creation generates valid SQL file with all schema and data
 *  2. Header comments, table DDL, and data inserts exist in dump
 *  3. Restore capability operates smoothly without foreign key conflicts
 *  4. Data integrity is preserved post-restore
 */

import * as fs from "fs";
import * as path from "path";
import * as mysql from "mysql2/promise";
import { backupDatabase } from "./backup-db";
import { restoreDatabase } from "./restore-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}: ${msg}`);
    errors.push(`${name}: ${msg}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 18 — BACKUP & RESTORE TEST SUITE");
  console.log("========================================\n");

  const testOutputDir = path.join(process.cwd(), "backups", "test");
  let generatedBackupPath = "";

  // 1. Test Backup Generation
  await test("Database backup generation creates valid SQL dump file", async () => {
    const res = await backupDatabase({
      outputDir: testOutputDir,
      filename: "test_verification_backup.sql",
    });

    generatedBackupPath = res.backupPath;
    assert(fs.existsSync(generatedBackupPath), "Backup file was not created");
    assert(res.totalTables >= 20, `Expected at least 20 tables, found ${res.totalTables}`);
    assert(res.totalRows > 0, `Expected positive row count, found ${res.totalRows}`);
    assert(res.fileSizeBytes > 1000, `Expected file size > 1KB, got ${res.fileSizeBytes}`);
  });

  // 2. Test Backup Contents
  await test("Backup SQL file contains valid DDL and DML statements", async () => {
    const content = fs.readFileSync(generatedBackupPath, "utf-8");
    assert(content.includes("CREATE TABLE `companies`"), "Dump missing companies table DDL");
    assert(content.includes("CREATE TABLE `accounts`"), "Dump missing accounts table DDL");
    assert(content.includes("CREATE TABLE `general_ledger`"), "Dump missing general_ledger table DDL");
    assert(content.includes("SET FOREIGN_KEY_CHECKS=0;"), "Dump missing FK disabling preamble");
    assert(content.includes("SET FOREIGN_KEY_CHECKS=1;"), "Dump missing FK enabling epilogue");
  });

  // 3. Test Restore Execution
  await test("Database restore executes dump file and restores all tables cleanly", async () => {
    const res = await restoreDatabase(generatedBackupPath);
    assert(res.restoredTables >= 20, `Expected at least 20 restored tables, got ${res.restoredTables}`);
  });

  // 4. Test Post-Restore Data Integrity
  await test("Post-restore data integrity: Company and COA records exist and match", async () => {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3307"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "erp_manajemen",
      decimalNumbers: true,
    });

    const [companies] = await pool.execute<mysql.RowDataPacket[]>("SELECT COUNT(*) AS c FROM companies");
    const [accounts] = await pool.execute<mysql.RowDataPacket[]>("SELECT COUNT(*) AS c FROM accounts");
    const [glTotal] = await pool.execute<mysql.RowDataPacket[]>("SELECT COALESCE(SUM(debit), 0) AS dr, COALESCE(SUM(credit), 0) AS cr FROM general_ledger");

    await pool.end();

    assert(Number(companies[0].c) >= 2, "Expected at least 2 companies");
    assert(Number(accounts[0].c) >= 20, "Expected at least 20 COA accounts");

    const dr = Number(glTotal[0].dr);
    const cr = Number(glTotal[0].cr);
    assert(Math.abs(dr - cr) < 0.05, `GL out of balance after restore: Dr ${dr} != Cr ${cr}`);
  });

  // Clean up test backup file
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  }

  // Summary
  console.log("\n========================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
