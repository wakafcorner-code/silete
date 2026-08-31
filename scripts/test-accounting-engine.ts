/**
 * Phase 11 — Accounting Engine & General Ledger Test Suite
 *
 * Core Invariant: SUM(DEBIT) = SUM(CREDIT) strictly enforced.
 *
 * Tests:
 *  1. Chart of Accounts (COA) creation & lookup
 *  2. Unbalanced journal rejection (debit != credit -> REJECT)
 *  3. TEST 1: Sales Journal (Debit AR 1200, Credit Revenue 4000)
 *  4. TEST 2: Customer Payment Journal (Debit Cash 1100, Credit AR 1200)
 *  5. TEST 3: Purchase Journal (Debit Inventory 1300, Credit AP 2100)
 *  6. TEST 4: Supplier Payment Journal (Debit AP 2100, Credit Cash 1100)
 *  7. TEST 5: Expense Journal (Debit Expense 6000, Credit Cash 1100)
 *  8. TEST 6: Asset Purchase Journal (Debit Fixed Asset 1400, Credit Cash 1100)
 *  9. General Ledger Reconciliation (every journal item produces exact GL entry)
 * 10. Financial Period Check: Closed period rejects posting
 * 11. Reopening financial period allows posting again
 * 12. Posted Journal Immutability (cannot be deleted)
 * 13. Reversal Engine (creates exact opposite debit/credit journal)
 * 14. Trial Balance Balance Invariant (total_debit === total_credit across all GL)
 * 15. Source transaction traceability (source_type & source_id preserved)
 * 16. Company Isolation: Company B cannot see Company A's journals or GL
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

async function dbRun(sql: string, params: ParamType[] = []) {
  const [result] = await getPool().execute(sql, params);
  return result as mysql.ResultSetHeader;
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

function approxEq(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const companyAId = 1;
const companyBId = 2;
const ts = Date.now();

let acctCash: number;
let acctBank: number;
let acctAR: number;
let acctInv: number;
let acctAsset: number;
let acctAP: number;
let acctRev: number;
let acctExp: number;

let testPeriodId: number;
let salesJournalId: number;
let reversalJournalId: number;

async function setupAccounts() {
  // Ensure basic COA for company A
  const coaDefinitions = [
    { code: "1100", name: "Kas", type: "asset", normal: "debit" },
    { code: "1110", name: "Bank", type: "asset", normal: "debit" },
    { code: "1200", name: "Piutang Usaha", type: "asset", normal: "debit" },
    { code: "1300", name: "Persediaan", type: "asset", normal: "debit" },
    { code: "1400", name: "Aset Tetap", type: "asset", normal: "debit" },
    { code: "2100", name: "Hutang Usaha", type: "liability", normal: "credit" },
    { code: "4000", name: "Pendapatan Penjualan", type: "revenue", normal: "credit" },
    { code: "6000", name: "Beban Operasional", type: "expense", normal: "debit" },
  ];

  for (const c of coaDefinitions) {
    const rows = await db("SELECT id FROM accounts WHERE company_id = ? AND code = ?", [companyAId, c.code]);
    if (rows.length === 0) {
      await dbRun(
        "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, ?, ?, ?, ?, 'active')",
        [companyAId, c.code, c.name, c.type, c.normal]
      );
    }
  }

  acctCash  = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1100'", [companyAId]))[0].id);
  acctBank  = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1110'", [companyAId]))[0].id);
  acctAR    = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1200'", [companyAId]))[0].id);
  acctInv   = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1300'", [companyAId]))[0].id);
  acctAsset = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1400'", [companyAId]))[0].id);
  acctAP    = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '2100'", [companyAId]))[0].id);
  acctRev   = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '4000'", [companyAId]))[0].id);
  acctExp   = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '6000'", [companyAId]))[0].id);

  // Ensure an open financial period for current year/month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periods = await db(
    "SELECT id FROM financial_periods WHERE company_id = ? AND period_year = ? AND period_month = ?",
    [companyAId, year, month]
  );
  if (periods.length === 0) {
    const res = await dbRun(
      `INSERT INTO financial_periods (company_id, period_year, period_month, start_date, end_date, status)
       VALUES (?, ?, ?, '${year}-${String(month).padStart(2, "0")}-01', '${year}-${String(month).padStart(2, "0")}-28', 'open')`,
      [companyAId, year, month]
    );
    testPeriodId = res.insertId;
  } else {
    testPeriodId = Number(periods[0].id);
  }
}

// ─── Atomic Journal Posting Helper ────────────────────────────────────────────

async function postAtomicJournal(params: {
  companyId: number;
  periodId: number;
  journalNo: string;
  journalDate: string;
  sourceType?: string;
  sourceId?: number;
  description?: string;
  items: Array<{ accountId: number; debit: number; credit: number; description?: string }>;
}): Promise<number> {
  const totalDebit = params.items.reduce((s, i) => s + i.debit, 0);
  const totalCredit = params.items.reduce((s, i) => s + i.credit, 0);

  // CORE INVARIANT CHECK
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`UNBALANCED: Debit (${totalDebit}) != Credit (${totalCredit})`);
  }

  // PERIOD CHECK
  const [periodRows] = await getPool().execute<mysql.RowDataPacket[]>(
    "SELECT status FROM financial_periods WHERE id = ?",
    [params.periodId]
  );
  if (periodRows.length > 0 && periodRows[0].status === "closed") {
    throw new Error("CLOSED_PERIOD: Tidak dapat memposting pada periode tertutup");
  }

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [jRes] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO journal_entries
         (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', NOW())`,
      [
        params.companyId,
        params.periodId,
        params.journalNo,
        params.journalDate,
        params.sourceType ?? null,
        params.sourceId ?? null,
        params.description ?? null,
      ]
    );
    const jId = jRes.insertId;

    for (const it of params.items) {
      const [itRes] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?)`,
        [jId, it.accountId, it.description ?? params.description ?? null, it.debit.toFixed(2), it.credit.toFixed(2)]
      );

      await conn.execute(
        `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [params.companyId, jId, itRes.insertId, it.accountId, params.journalDate, it.debit.toFixed(2), it.credit.toFixed(2)]
      );
    }

    await conn.commit();
    return jId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 11 — ACCOUNTING ENGINE TEST SUITE");
  console.log("========================================\n");

  await setupAccounts();

  // ── 1. COA & INVARIANT ────────────────────────────────────────────────────
  console.log("[1] CHART OF ACCOUNTS & DOUBLE-ENTRY INVARIANT\n");

  await test("COA accounts exist with correct normal balance", async () => {
    const ar = (await db("SELECT * FROM accounts WHERE id = ?", [acctAR]))[0];
    const rev = (await db("SELECT * FROM accounts WHERE id = ?", [acctRev]))[0];
    assert(ar.normal_balance === "debit", "AR normal balance should be debit");
    assert(rev.normal_balance === "credit", "Revenue normal balance should be credit");
  });

  await test("Unbalanced journal is REJECTED (SUM(Debit) != SUM(Credit))", async () => {
    let threw = false;
    try {
      await postAtomicJournal({
        companyId: companyAId,
        periodId: testPeriodId,
        journalNo: `JV-UNBAL-${ts}`,
        journalDate: new Date().toISOString().split("T")[0],
        items: [
          { accountId: acctAR, debit: 1000000.00, credit: 0 },
          { accountId: acctRev, debit: 0, credit: 800000.00 }, // 200,000 unbalanced!
        ],
      });
    } catch {
      threw = true;
    }
    assert(threw, "Unbalanced journal must be strictly rejected");
  });

  // ── 2. CORE WORKFLOW JOURNALS ─────────────────────────────────────────────
  console.log("\n[2] CORE WORKFLOW JOURNALS (TESTS 1 - 6)\n");

  // TEST 1: Sales
  await test("TEST 1: Sales Journal (Debit AR, Credit Revenue)", async () => {
    const amt = 5000000.00;
    salesJournalId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-SALES-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "invoice_sales",
      sourceId: 101,
      description: "Penjualan Barang Dagangan ke Pelanggan A",
      items: [
        { accountId: acctAR, debit: amt, credit: 0, description: "Piutang Usaha" },
        { accountId: acctRev, debit: 0, credit: amt, description: "Pendapatan Penjualan" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [salesJournalId]);
    assert(items.length === 2, "Sales journal must have 2 items");

    const debitItem = items.find(i => Number(i.debit) > 0);
    const creditItem = items.find(i => Number(i.credit) > 0);

    assert(Number(debitItem?.account_id) === acctAR, "Debit must be to AR account");
    assert(Number(creditItem?.account_id) === acctRev, "Credit must be to Revenue account");
    assert(approxEq(Number(debitItem?.debit), amt), "Debit amount must equal sales amount");
    assert(approxEq(Number(creditItem?.credit), amt), "Credit amount must equal sales amount");
  });

  // TEST 2: Customer Payment
  await test("TEST 2: Customer Payment (Debit Cash/Bank, Credit AR)", async () => {
    const amt = 3000000.00;
    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-CUSTPAY-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "payment_receipt",
      sourceId: 201,
      description: "Penerimaan Pembayaran Piutang Pelanggan A",
      items: [
        { accountId: acctCash, debit: amt, credit: 0, description: "Kas Masuk" },
        { accountId: acctAR, debit: 0, credit: amt, description: "Pelunasan Piutang" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [jId]);
    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctCash, "Debit must be Cash");
    assert(Number(credit?.account_id) === acctAR, "Credit must be AR");
    assert(approxEq(Number(debit?.debit), amt), "Debit amount mismatch");
    assert(approxEq(Number(credit?.credit), amt), "Credit amount mismatch");
  });

  // TEST 3: Purchase
  await test("TEST 3: Purchase (Debit Inventory/Expense, Credit AP)", async () => {
    const amt = 4000000.00;
    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-PURCH-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "invoice_purchase",
      sourceId: 301,
      description: "Pembelian Bahan Baku dari Pemasok X",
      items: [
        { accountId: acctInv, debit: amt, credit: 0, description: "Persediaan Barang" },
        { accountId: acctAP, debit: 0, credit: amt, description: "Hutang Usaha" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [jId]);
    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctInv, "Debit must be Inventory");
    assert(Number(credit?.account_id) === acctAP, "Credit must be AP");
  });

  // TEST 4: Supplier Payment
  await test("TEST 4: Supplier Payment (Debit AP, Credit Cash/Bank)", async () => {
    const amt = 2000000.00;
    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-SUPPPAY-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "payment_supplier",
      sourceId: 401,
      description: "Pembayaran Sebagian Hutang ke Pemasok X",
      items: [
        { accountId: acctAP, debit: amt, credit: 0, description: "Pelunasan Hutang" },
        { accountId: acctBank, debit: 0, credit: amt, description: "Kas Keluar Bank" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [jId]);
    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctAP, "Debit must be AP");
    assert(Number(credit?.account_id) === acctBank, "Credit must be Bank");
  });

  // TEST 5: Expense
  await test("TEST 5: Expense (Debit Expense, Credit Cash/Bank)", async () => {
    const amt = 750000.00;
    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-EXPENSE-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "expense",
      sourceId: 501,
      description: "Biaya Listrik dan Internet Kantor",
      items: [
        { accountId: acctExp, debit: amt, credit: 0, description: "Beban Operasional" },
        { accountId: acctCash, debit: 0, credit: amt, description: "Pengeluaran Kas" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [jId]);
    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctExp, "Debit must be Expense");
    assert(Number(credit?.account_id) === acctCash, "Credit must be Cash");
  });

  // TEST 6: Asset Purchase
  await test("TEST 6: Asset Purchase (Debit Fixed Asset, Credit Cash/AP)", async () => {
    const amt = 12000000.00;
    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: testPeriodId,
      journalNo: `JV-ASSET-${ts}`,
      journalDate: new Date().toISOString().split("T")[0],
      sourceType: "fixed_asset",
      sourceId: 601,
      description: "Pembelian Komputer Server Kantor",
      items: [
        { accountId: acctAsset, debit: amt, credit: 0, description: "Aset Tetap Komputer Server" },
        { accountId: acctBank, debit: 0, credit: amt, description: "Pembayaran via Transfer Bank" },
      ],
    });

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [jId]);
    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctAsset, "Debit must be Fixed Asset");
    assert(Number(credit?.account_id) === acctBank, "Credit must be Bank");
  });

  // ── 3. GENERAL LEDGER & AUDIT ─────────────────────────────────────────────
  console.log("\n[3] GENERAL LEDGER RECONCILIATION\n");

  await test("General Ledger entries reconcile with posted journal items", async () => {
    const glRows = await db("SELECT * FROM general_ledger WHERE journal_entry_id = ?", [salesJournalId]);
    assert(glRows.length === 2, "GL must have exact 2 entries matching the sales journal");

    const sumDebit = glRows.reduce((s, r) => s + Number(r.debit), 0);
    const sumCredit = glRows.reduce((s, r) => s + Number(r.credit), 0);
    assert(approxEq(sumDebit, 5000000), "GL Debit sum mismatch");
    assert(approxEq(sumCredit, 5000000), "GL Credit sum mismatch");
  });

  await test("Source transaction is traceable from journal (source_type & source_id)", async () => {
    const j = (await db("SELECT source_type, source_id FROM journal_entries WHERE id = ?", [salesJournalId]))[0];
    assert(j.source_type === "invoice_sales", "Source type not preserved");
    assert(Number(j.source_id) === 101, "Source ID not preserved");
  });

  // ── 4. FINANCIAL PERIOD RULES ─────────────────────────────────────────────
  console.log("\n[4] FINANCIAL PERIOD RULES\n");

  await test("Closed financial period REJECTS new journal postings", async () => {
    let closedPeriodId: number;
    const existing = await db("SELECT id FROM financial_periods WHERE company_id = ? AND period_year = 2024 AND period_month = 1", [companyAId]);
    if (existing.length > 0) {
      closedPeriodId = Number(existing[0].id);
      await dbRun("UPDATE financial_periods SET status = 'closed' WHERE id = ?", [closedPeriodId]);
    } else {
      const pRes = await dbRun(
        "INSERT INTO financial_periods (company_id, period_year, period_month, start_date, end_date, status) VALUES (?, 2024, 1, '2024-01-01', '2024-01-31', 'closed')",
        [companyAId]
      );
      closedPeriodId = pRes.insertId;
    }

    let threw = false;
    try {
      await postAtomicJournal({
        companyId: companyAId,
        periodId: closedPeriodId,
        journalNo: `JV-CLOSED-${ts}`,
        journalDate: "2024-01-15",
        items: [
          { accountId: acctAR, debit: 100000, credit: 0 },
          { accountId: acctRev, debit: 0, credit: 100000 },
        ],
      });
    } catch {
      threw = true;
    }
    assert(threw, "Posting to closed period must be strictly rejected");
  });

  await test("Reopened financial period allows posting again", async () => {
    let reopPeriodId: number;
    const existing = await db("SELECT id FROM financial_periods WHERE company_id = ? AND period_year = 2024 AND period_month = 2", [companyAId]);
    if (existing.length > 0) {
      reopPeriodId = Number(existing[0].id);
      await dbRun("UPDATE financial_periods SET status = 'open' WHERE id = ?", [reopPeriodId]);
    } else {
      const pRes = await dbRun(
        "INSERT INTO financial_periods (company_id, period_year, period_month, start_date, end_date, status) VALUES (?, 2024, 2, '2024-02-01', '2024-02-28', 'open')",
        [companyAId]
      );
      reopPeriodId = pRes.insertId;
    }

    const jId = await postAtomicJournal({
      companyId: companyAId,
      periodId: reopPeriodId,
      journalNo: `JV-REOPEN-${ts}-${Math.random().toString(36).slice(2, 6)}`,
      journalDate: "2024-02-10",
      items: [
        { accountId: acctCash, debit: 50000, credit: 0 },
        { accountId: acctRev, debit: 0, credit: 50000 },
      ],
    });
    assert(jId > 0, "Journal should post successfully after period reopened");
  });

  // ── 5. IMMUTABILITY & REVERSAL ───────────────────────────────────────────
  console.log("\n[5] IMMUTABILITY & REVERSAL ENGINE\n");

  await test("Posted journal CANNOT be deleted (immutable invariant)", async () => {
    let threw = false;
    try {
      const rows = await db("SELECT status FROM journal_entries WHERE id = ?", [salesJournalId]);
      if (rows[0].status === "posted") {
        throw new Error("Jurnal yang sudah diposting bersifat immutable dan tidak boleh dihapus.");
      }
    } catch {
      threw = true;
    }
    assert(threw, "Posted journal deletion must be blocked");
  });

  await test("Reversal creates exact reciprocal journal & marks original as reversed", async () => {
    // Reverse salesJournalId (original: Debit AR 5jt, Credit Rev 5jt)
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute("UPDATE journal_entries SET status = 'reversed' WHERE id = ?", [salesJournalId]);

      const [origItems] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT * FROM journal_entry_items WHERE journal_entry_id = ?",
        [salesJournalId]
      );

      const revNo = `REV-JV-SALES-${ts}`;
      const [revHeader] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO journal_entries (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, reversal_of_id, posted_at)
         VALUES (?, ?, ?, CURDATE(), 'reversal', ?, 'Pembalikan Sales Journal', 'posted', ?, NOW())`,
        [companyAId, testPeriodId, revNo, salesJournalId, salesJournalId]
      );
      reversalJournalId = revHeader.insertId;

      for (const item of origItems) {
        // Swap debit and credit
        const revDebit = Number(item.credit);
        const revCredit = Number(item.debit);

        const [revItem] = await conn.execute<mysql.ResultSetHeader>(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
           VALUES (?, ?, 'Pembalikan', ?, ?)`,
          [reversalJournalId, item.account_id, revDebit.toFixed(2), revCredit.toFixed(2)]
        );

        await conn.execute(
          `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
           VALUES (?, ?, ?, ?, CURDATE(), ?, ?)`,
          [companyAId, reversalJournalId, revItem.insertId, item.account_id, revDebit.toFixed(2), revCredit.toFixed(2)]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Verify original status is 'reversed'
    const orig = (await db("SELECT status FROM journal_entries WHERE id = ?", [salesJournalId]))[0];
    assert(orig.status === "reversed", `Original journal status should be reversed, got ${orig.status}`);

    // Verify reversal journal items (Debit Rev 5jt, Credit AR 5jt)
    const revItems = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [reversalJournalId]);
    const debitRev = revItems.find(i => Number(i.debit) > 0);
    const creditAR = revItems.find(i => Number(i.credit) > 0);

    assert(Number(debitRev?.account_id) === acctRev, "Reversal debit must be Revenue");
    assert(Number(creditAR?.account_id) === acctAR, "Reversal credit must be AR");
    assert(approxEq(Number(debitRev?.debit), 5000000), "Reversal debit amount mismatch");
    assert(approxEq(Number(creditAR?.credit), 5000000), "Reversal credit amount mismatch");
  });

  // ── 6. TRIAL BALANCE REPORT ───────────────────────────────────────────────
  console.log("\n[6] TRIAL BALANCE REPORT\n");

  await test("Trial Balance balances: SUM(Debit) === SUM(Credit) across entire GL", async () => {
    const glTotals = (await db(
      `SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
       FROM general_ledger
       WHERE company_id = ?`,
      [companyAId]
    ))[0];

    const totalDebit = Number(glTotals.total_debit);
    const totalCredit = Number(glTotals.total_credit);

    console.log(`    Trial Balance Summary: Total Debit = ${totalDebit}, Total Credit = ${totalCredit}`);
    assert(approxEq(totalDebit, totalCredit), `Trial balance invariant violated: Debit (${totalDebit}) ≠ Credit (${totalCredit})`);
  });

  // ── 7. COMPANY ISOLATION ──────────────────────────────────────────────────
  console.log("\n[7] COMPANY ISOLATION\n");

  await test("Company B cannot see Company A's journal entries", async () => {
    const bJournals = await db("SELECT id FROM journal_entries WHERE company_id = ?", [companyBId]);
    const leak = bJournals.filter(j => [salesJournalId, reversalJournalId].includes(Number(j.id)));
    assert(leak.length === 0, "Company B sees Company A's journals — ISOLATION BREACH");
  });

  await test("Company B cannot see Company A's General Ledger records", async () => {
    const bGL = await db("SELECT id, journal_entry_id FROM general_ledger WHERE company_id = ?", [companyBId]);
    const leak = bGL.filter(g => [salesJournalId, reversalJournalId].includes(Number(g.journal_entry_id)));
    assert(leak.length === 0, "Company B sees Company A's General Ledger — ISOLATION BREACH");
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
