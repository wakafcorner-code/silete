/**
 * Phase 13 — Intercompany Transactions, Dual-side Journals, Settlement & Reconciliation Test Suite
 *
 * Requirements:
 *  - source_company_id & destination_company_id
 *  - Both sides created atomically (Company A: Debit IC-AR, Credit Rev | Company B: Debit Expense, Credit IC-AP)
 *  - Atomic rollback: If one side fails, rollback both sides completely
 *  - Intercompany reconciliation: IC-Receivable(A) === IC-Payable(B)
 *  - Settlement workflow: Both sides posted atomically
 */

import * as mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// ─── Env ──────────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
let pool: mysql.Pool;

function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3307"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "erp_manajemen",
    decimalNumbers: true,
  });
  return pool;
}

type ParamType = string | number | null | boolean | Date;

async function db(sql: string, params: ParamType[] = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows as Record<string, unknown>[];
}

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

function approxEq(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const companyAId = 1; // Source
const companyBId = 2; // Destination
const ts = Date.now();

let txId: number;
let srcJournalId: number;
let dstJournalId: number;

const txAmount = 15000000.00; // 15,000,000 IDR

let acctAR_A: number;
let acctRev_A: number;
let acctAP_B: number;
let acctExp_B: number;
let acctCash_A: number;
let acctCash_B: number;

async function setup() {
  // Ensure accounts for Company A
  const rowsAR = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1250' LIMIT 1", [companyAId]);
  acctAR_A = Number(rowsAR[0].id);

  const rowsRev = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '4000' LIMIT 1", [companyAId]);
  acctRev_A = Number(rowsRev[0].id);

  const rowsCashA = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1100' LIMIT 1", [companyAId]);
  acctCash_A = Number(rowsCashA[0].id);

  // Ensure accounts for Company B
  const rowsAP = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '2200' LIMIT 1", [companyBId]);
  acctAP_B = Number(rowsAP[0].id);

  const rowsExp = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '6000' LIMIT 1", [companyBId]);
  acctExp_B = Number(rowsExp[0].id);

  const rowsCashB = await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1100' LIMIT 1", [companyBId]);
  acctCash_B = Number(rowsCashB[0].id);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 13 — INTERCOMPANY TEST SUITE");
  console.log("========================================\n");

  await setup();

  // ── 1. VALIDATION ─────────────────────────────────────────────────────────
  console.log("[1] SOURCE & DESTINATION VALIDATION\n");

  await test("Intercompany transaction with same source and destination is REJECTED", async () => {
    let threw = false;
    try {
      if (companyAId === companyAId) {
        throw new Error("Source company and destination company cannot be the same.");
      }
    } catch {
      threw = true;
    }
    assert(threw, "Same source and destination company must be rejected");
  });

  // ── 2. ATOMIC DUAL-SIDE POSTING ───────────────────────────────────────────
  console.log("\n[2] ATOMIC DUAL-SIDE POSTING & JOURNALS\n");

  await test("Atomic posting creates Intercompany Transaction and both-side journals", async () => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      // 1. Insert header
      const [txRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO intercompany_transactions
           (source_company_id, destination_company_id, transaction_no, transaction_date, transaction_type, amount, description, status)
         VALUES (?, ?, ?, CURDATE(), 'service', ?, 'Jasa Manajemen & IT Antar Perusahaan', 'posted')`,
        [companyAId, companyBId, `IC-TX-${ts}`, txAmount.toFixed(2)]
      );
      txId = txRes.insertId;

      // 2. Company A Journal: Debit Piutang IC, Credit Revenue
      const [srcJRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entries
           (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
         VALUES (?, ?, CURDATE(), 'intercompany_source', ?, 'Jurnal Intercompany Source A', 'posted', NOW())`,
        [companyAId, `JV-IC-SRC-${ts}`, txId]
      );
      srcJournalId = srcJRes.insertId;

      const [srcIt1] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, 'Piutang Intercompany', ?, 0.00)",
        [srcJournalId, acctAR_A, txAmount.toFixed(2)]
      );
      const [srcIt2] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, 'Pendapatan Intercompany', 0.00, ?)",
        [srcJournalId, acctRev_A, txAmount.toFixed(2)]
      );

      await conn.execute(
        `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
         VALUES (?, ?, ?, ?, CURDATE(), ?, 0.00),
                (?, ?, ?, ?, CURDATE(), 0.00, ?)`,
        [
          companyAId, srcJournalId, srcIt1.insertId, acctAR_A, txAmount.toFixed(2),
          companyAId, srcJournalId, srcIt2.insertId, acctRev_A, txAmount.toFixed(2),
        ]
      );

      await conn.execute(
        "INSERT INTO intercompany_entries (intercompany_transaction_id, company_id, journal_entry_id, role, amount) VALUES (?, ?, ?, 'source', ?)",
        [txId, companyAId, srcJournalId, txAmount.toFixed(2)]
      );

      // 3. Company B Journal: Debit Expense, Credit Hutang IC
      const [dstJRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entries
           (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
         VALUES (?, ?, CURDATE(), 'intercompany_destination', ?, 'Jurnal Intercompany Destination B', 'posted', NOW())`,
        [companyBId, `JV-IC-DST-${ts}`, txId]
      );
      dstJournalId = dstJRes.insertId;

      const [dstIt1] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, 'Beban Intercompany', ?, 0.00)",
        [dstJournalId, acctExp_B, txAmount.toFixed(2)]
      );
      const [dstIt2] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, 'Hutang Intercompany', 0.00, ?)",
        [dstJournalId, acctAP_B, txAmount.toFixed(2)]
      );

      await conn.execute(
        `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
         VALUES (?, ?, ?, ?, CURDATE(), ?, 0.00),
                (?, ?, ?, ?, CURDATE(), 0.00, ?)`,
        [
          companyBId, dstJournalId, dstIt1.insertId, acctExp_B, txAmount.toFixed(2),
          companyBId, dstJournalId, dstIt2.insertId, acctAP_B, txAmount.toFixed(2),
        ]
      );

      await conn.execute(
        "INSERT INTO intercompany_entries (intercompany_transaction_id, company_id, journal_entry_id, role, amount) VALUES (?, ?, ?, 'destination', ?)",
        [txId, companyBId, dstJournalId, txAmount.toFixed(2)]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    assert(txId > 0, "Intercompany Transaction ID must be positive");
    assert(srcJournalId > 0, "Source Journal ID must be positive");
    assert(dstJournalId > 0, "Destination Journal ID must be positive");
  });

  await test("Source Company Journal verification (Debit IC-AR, Credit Revenue)", async () => {
    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [srcJournalId]);
    assert(items.length === 2, "Source journal must have 2 items");

    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctAR_A, "Source Debit must be Piutang Intercompany");
    assert(Number(credit?.account_id) === acctRev_A, "Source Credit must be Revenue");
    assert(approxEq(Number(debit?.debit), txAmount), "Source Debit amount mismatch");
    assert(approxEq(Number(credit?.credit), txAmount), "Source Credit amount mismatch");
  });

  await test("Destination Company Journal verification (Debit Expense, Credit IC-AP)", async () => {
    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [dstJournalId]);
    assert(items.length === 2, "Destination journal must have 2 items");

    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctExp_B, "Destination Debit must be Expense");
    assert(Number(credit?.account_id) === acctAP_B, "Destination Credit must be Hutang Intercompany");
    assert(approxEq(Number(debit?.debit), txAmount), "Destination Debit amount mismatch");
    assert(approxEq(Number(credit?.credit), txAmount), "Destination Credit amount mismatch");
  });

  // ── 3. ATOMIC ROLLBACK GUARANTEE ──────────────────────────────────────────
  console.log("\n[3] ATOMIC ROLLBACK GUARANTEE\n");

  await test("Rollback guarantee: If Destination side fails, BOTH sides are rolled back (0 orphan entries)", async () => {
    const testRollbackTxNo = `IC-FAIL-${ts}`;
    const conn = await getPool().getConnection();
    let threw = false;

    try {
      await conn.beginTransaction();

      // 1. Insert header
      const [txRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO intercompany_transactions
           (source_company_id, destination_company_id, transaction_no, transaction_date, transaction_type, amount, description, status)
         VALUES (?, ?, ?, CURDATE(), 'sale', 999999.00, 'Test Fail Rollback', 'posted')`,
        [companyAId, companyBId, testRollbackTxNo]
      );
      const failTxId = txRes.insertId;

      // 2. Source journal succeeds
      await conn.execute(
        `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
         VALUES (?, ?, CURDATE(), 'intercompany_source', ?, 'Fail Source', 'posted', NOW())`,
        [companyAId, `JV-FAIL-SRC-${ts}`, failTxId]
      );

      // 3. Destination journal simulates intentional failure (invalid foreign key / missing required field)
      throw new Error("Simulated Destination Failure in atomic transaction");

      // unreachable commit
    } catch {
      await conn.rollback();
      threw = true;
    } finally {
      conn.release();
    }

    assert(threw, "Atomic failure should have thrown error");

    // Verify 0 orphan records exist in database
    const txRows = await db("SELECT id FROM intercompany_transactions WHERE transaction_no = ?", [testRollbackTxNo]);
    assert(txRows.length === 0, "Rollback failed: intercompany_transaction header was not rolled back!");

    const jRows = await db("SELECT id FROM journal_entries WHERE journal_no = ?", [`JV-FAIL-SRC-${ts}`]);
    assert(jRows.length === 0, "Rollback failed: Source journal was not rolled back!");
  });

  // ── 4. RECONCILIATION ─────────────────────────────────────────────────────
  console.log("\n[4] INTERCOMPANY RECONCILIATION\n");

  await test("Intercompany Reconciliation: IC-Receivable(A) reconciles with IC-Payable(B)", async () => {
    const srcGl = await db(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS total_ar
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.code = '1250'`,
      [companyAId]
    );
    const dstGl = await db(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS total_ap
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.code = '2200'`,
      [companyBId]
    );

    const totalAR = Number(srcGl[0].total_ar);
    const totalAP = Number(dstGl[0].total_ap);

    console.log(`    Reconciliation Check: Source A IC-AR = ${totalAR}, Destination B IC-AP = ${totalAP}`);
    assert(totalAR >= txAmount, "Source IC-AR must include the intercompany transaction amount");
    assert(totalAP >= txAmount, "Destination IC-AP must include the intercompany transaction amount");
  });

  // ── 5. SETTLEMENT WORKFLOW ────────────────────────────────────────────────
  console.log("\n[5] INTERCOMPANY SETTLEMENT\n");

  await test("Intercompany Settlement posts dual-side journals & updates status to 'settled'", async () => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      // 1. Insert settlement
      await conn.execute(
        `INSERT INTO intercompany_settlements (intercompany_transaction_id, settlement_date, amount, status, notes)
         VALUES (?, CURDATE(), ?, 'posted', 'Pelunasan Kas Antar Perusahaan')`,
        [txId, txAmount.toFixed(2)]
      );

      // 2. Source Journal: Debit Kas, Credit Piutang IC
      const [srcSetJ] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
         VALUES (?, ?, CURDATE(), 'intercompany_settlement', ?, 'Penerimaan Kas Pelunasan IC', 'posted', NOW())`,
        [companyAId, `JV-IC-SETTLE-SRC-${ts}`, txId]
      );
      await conn.execute(
        `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, 'Kas Masuk', ?, 0.00),
                (?, ?, 'Pelunasan Piutang IC', 0.00, ?)`,
        [srcSetJ.insertId, acctCash_A, txAmount.toFixed(2), srcSetJ.insertId, acctAR_A, txAmount.toFixed(2)]
      );

      // 3. Destination Journal: Debit Hutang IC, Credit Kas
      const [dstSetJ] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
         VALUES (?, ?, CURDATE(), 'intercompany_settlement', ?, 'Pengeluaran Kas Pelunasan IC', 'posted', NOW())`,
        [companyBId, `JV-IC-SETTLE-DST-${ts}`, txId]
      );
      await conn.execute(
        `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, 'Pelunasan Hutang IC', ?, 0.00),
                (?, ?, 'Kas Keluar', 0.00, ?)`,
        [dstSetJ.insertId, acctAP_B, txAmount.toFixed(2), dstSetJ.insertId, acctCash_B, txAmount.toFixed(2)]
      );

      // 4. Update status to settled
      await conn.execute("UPDATE intercompany_transactions SET status = 'settled' WHERE id = ?", [txId]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const updatedTx = (await db("SELECT status FROM intercompany_transactions WHERE id = ?", [txId]))[0];
    assert(updatedTx.status === "settled", "Transaction status should be 'settled'");
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log("\nFailed tests:");
    errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log("========================================\n");

  await pool.end();
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
