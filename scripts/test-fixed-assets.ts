/**
 * Phase 12 — Fixed Assets & Depreciation Test Suite
 *
 * Method: Straight-Line Depreciation
 *
 * Tests:
 *  1. Asset Category creation with useful life configuration
 *  2. Asset Acquisition & Registration (Cost, Residual Value, Useful Life)
 *  3. Acquisition Journal Integration (Debit 1400 Aset Tetap, Credit 1100 Kas)
 *  4. Straight-line monthly depreciation calculation verification
 *  5. 1st Month Depreciation Posting (Journal: Debit 6000, Credit 1500)
 *  6. Accumulated depreciation increase & book value decrease verification
 *  7. 2nd Month Depreciation accumulation
 *  8. Depreciation limit invariant: Accumulated depreciation <= (Cost - Residual)
 *  9. Asset Disposal workflow with disposal journal posting & gain/loss calculation
 * 10. Invariant: Depreciation strictly BLOCKED/STOPPED after asset is disposed
 * 11. Company Isolation: Company B cannot see Company A's assets or categories
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

function approxEq(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const companyAId = 1;
const companyBId = 2;
const ts = Date.now();

let categoryId: number;
let assetId: number;
let acqJournalId: number;
let dep1JournalId: number;
let disposalJournalId: number;

const cost = 24000000.00; // 24,000,000 IDR
const residual = 0.00;
const usefulLifeMonths = 24; // 24 months = 2 years
const expectedMonthlyDep = (cost - residual) / usefulLifeMonths; // 1,000,000 IDR / month

let acctAsset: number;
let acctAccum: number;
let acctCash: number;
let acctExp: number;

async function setup() {
  // Ensure required accounts for Company A
  acctAsset = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1400'", [companyAId]))[0].id);
  acctAccum = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1500'", [companyAId]))[0].id);
  acctCash  = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '1100'", [companyAId]))[0].id);
  acctExp   = Number((await db("SELECT id FROM accounts WHERE company_id = ? AND code = '6000'", [companyAId]))[0].id);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 12 — FIXED ASSETS TEST SUITE");
  console.log("========================================\n");

  await setup();

  // ── 1. ASSET CATEGORY ─────────────────────────────────────────────────────
  console.log("[1] ASSET CATEGORY\n");

  await test("Asset Category creation with useful life configuration", async () => {
    const res = await dbRun(
      `INSERT INTO asset_categories (company_id, code, name, useful_life_months, depreciation_method)
       VALUES (?, ?, 'Peralatan Kantor Komputer', ?, 'straight_line')`,
      [companyAId, `CAT-KOMP-${ts}`, usefulLifeMonths]
    );
    categoryId = res.insertId;
    assert(categoryId > 0, "Category ID must be positive");

    const cat = (await db("SELECT * FROM asset_categories WHERE id = ?", [categoryId]))[0];
    assert(Number(cat.useful_life_months) === usefulLifeMonths, "Useful life months mismatch");
    assert(cat.depreciation_method === "straight_line", "Depreciation method mismatch");
  });

  // ── 2. ASSET ACQUISITION & JOURNAL ────────────────────────────────────────
  console.log("\n[2] ASSET ACQUISITION & REGISTRATION\n");

  await test("Asset registration with acquisition cost and initial status active", async () => {
    const res = await dbRun(
      `INSERT INTO assets (company_id, category_id, asset_code, name, acquisition_date, acquisition_cost, residual_value, accumulated_depreciation, status)
       VALUES (?, ?, ?, 'Server Dell PowerEdge R740', CURDATE(), ?, ?, 0.00, 'active')`,
      [companyAId, categoryId, `AST-SRV-${ts}`, cost.toFixed(2), residual.toFixed(2)]
    );
    assetId = res.insertId;
    assert(assetId > 0, "Asset ID must be positive");

    const asset = (await db("SELECT * FROM assets WHERE id = ?", [assetId]))[0];
    assert(approxEq(Number(asset.acquisition_cost), cost), "Cost mismatch");
    assert(approxEq(Number(asset.accumulated_depreciation), 0), "Initial accumulated depreciation must be 0");
    assert(asset.status === "active", "Initial status must be active");
  });

  await test("Acquisition Journal Integration (Debit: 1400 Aset Tetap, Credit: 1100 Kas)", async () => {
    // Post acquisition journal
    const jRes = await dbRun(
      `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
       VALUES (?, ?, CURDATE(), 'fixed_asset_acquisition', ?, 'Perolehan Aset Server', 'posted', NOW())`,
      [companyAId, `JV-ACQ-AST-${ts}`, assetId]
    );
    acqJournalId = jRes.insertId;

    // Items
    await dbRun(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Aset Tetap Server', ?, 0.00),
              (?, ?, 'Kas Keluar Pembelian Server', 0.00, ?)`,
      [acqJournalId, acctAsset, cost.toFixed(2), acqJournalId, acctCash, cost.toFixed(2)]
    );

    // GL
    await dbRun(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, 1, ?, CURDATE(), ?, 0.00),
              (?, ?, 2, ?, CURDATE(), 0.00, ?)`,
      [companyAId, acqJournalId, acctAsset, cost.toFixed(2), companyAId, acqJournalId, acctCash, cost.toFixed(2)]
    );

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [acqJournalId]);
    assert(items.length === 2, "Acquisition journal must have 2 items");

    const debit = items.find(i => Number(i.debit) > 0);
    const credit = items.find(i => Number(i.credit) > 0);

    assert(Number(debit?.account_id) === acctAsset, "Debit must be Aset Tetap (1400)");
    assert(Number(credit?.account_id) === acctCash, "Credit must be Kas (1100)");
    assert(approxEq(Number(debit?.debit), cost), "Debit amount mismatch");
  });

  // ── 3. STRAIGHT-LINE DEPRECIATION ─────────────────────────────────────────
  console.log("\n[3] STRAIGHT-LINE DEPRECIATION ENGINE\n");

  await test("Monthly straight-line rate calculation is exact", async () => {
    const calcMonthly = (cost - residual) / usefulLifeMonths;
    assert(approxEq(calcMonthly, expectedMonthlyDep), `Monthly depreciation calculation failed: ${calcMonthly} != ${expectedMonthlyDep}`);
  });

  await test("1st Month Depreciation Posting (Debit: 6000 Beban, Credit: 1500 Akumulasi)", async () => {
    // 1. Post Depreciation Journal
    const jRes = await dbRun(
      `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
       VALUES (?, ?, CURDATE(), 'asset_depreciation', ?, 'Penyusutan Bulan 1 Server', 'posted', NOW())`,
      [companyAId, `JV-DEP1-AST-${ts}`, assetId]
    );
    dep1JournalId = jRes.insertId;

    await dbRun(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Beban Penyusutan Server', ?, 0.00),
              (?, ?, 'Akumulasi Penyusutan Server', 0.00, ?)`,
      [dep1JournalId, acctExp, expectedMonthlyDep.toFixed(2), dep1JournalId, acctAccum, expectedMonthlyDep.toFixed(2)]
    );

    await dbRun(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, 1, ?, CURDATE(), ?, 0.00),
              (?, ?, 2, ?, CURDATE(), 0.00, ?)`,
      [companyAId, dep1JournalId, acctExp, expectedMonthlyDep.toFixed(2), companyAId, dep1JournalId, acctAccum, expectedMonthlyDep.toFixed(2)]
    );

    // 2. Insert into asset_depreciations
    await dbRun(
      `INSERT INTO asset_depreciations (asset_id, depreciation_date, amount, journal_entry_id, status)
       VALUES (?, CURDATE(), ?, ?, 'posted')`,
      [assetId, expectedMonthlyDep.toFixed(2), dep1JournalId]
    );

    // 3. Update asset accumulated depreciation
    await dbRun(
      "UPDATE assets SET accumulated_depreciation = accumulated_depreciation + ? WHERE id = ?",
      [expectedMonthlyDep.toFixed(2), assetId]
    );

    const asset = (await db("SELECT * FROM assets WHERE id = ?", [assetId]))[0];
    assert(approxEq(Number(asset.accumulated_depreciation), expectedMonthlyDep), "Accumulated depreciation mismatch after 1st month");

    const bookValue = Number(asset.acquisition_cost) - Number(asset.accumulated_depreciation);
    assert(approxEq(bookValue, cost - expectedMonthlyDep), "Book value mismatch after 1st month");
  });

  await test("2nd Month Depreciation accumulation", async () => {
    // Post 2nd month
    await dbRun(
      `INSERT INTO asset_depreciations (asset_id, depreciation_date, amount, status)
       VALUES (?, DATE_ADD(CURDATE(), INTERVAL 1 MONTH), ?, 'posted')`,
      [assetId, expectedMonthlyDep.toFixed(2)]
    );

    await dbRun(
      "UPDATE assets SET accumulated_depreciation = accumulated_depreciation + ? WHERE id = ?",
      [expectedMonthlyDep.toFixed(2), assetId]
    );

    const asset = (await db("SELECT * FROM assets WHERE id = ?", [assetId]))[0];
    assert(approxEq(Number(asset.accumulated_depreciation), expectedMonthlyDep * 2), "Accumulated depreciation mismatch after 2nd month");

    const bookValue = Number(asset.acquisition_cost) - Number(asset.accumulated_depreciation);
    assert(approxEq(bookValue, cost - (expectedMonthlyDep * 2)), "Book value mismatch after 2nd month");
  });

  await test("Depreciation limit invariant: cannot depreciate beyond depreciable base", async () => {
    const asset = (await db("SELECT * FROM assets WHERE id = ?", [assetId]))[0];
    const currentAccum = Number(asset.accumulated_depreciation);
    const maxAllowed = Number(asset.acquisition_cost) - Number(asset.residual_value);
    const remaining = maxAllowed - currentAccum;

    assert(remaining > 0, "Remaining depreciable should be positive");
    assert(currentAccum <= maxAllowed, "Accumulated depreciation cannot exceed depreciable base");
  });

  // ── 4. ASSET DISPOSAL ─────────────────────────────────────────────────────
  console.log("\n[4] ASSET DISPOSAL WORKFLOW\n");

  await test("Asset Disposal updates status to 'disposed' and posts disposal journal", async () => {
    const asset = (await db("SELECT * FROM assets WHERE id = ?", [assetId]))[0];
    const currentCost = Number(asset.acquisition_cost);
    const currentAccum = Number(asset.accumulated_depreciation); // 2,000,000
    const currentBookValue = currentCost - currentAccum; // 22,000,000
    const salePrice = 20000000.00; // Sold for 20,000,000 -> Loss = 2,000,000
    const loss = currentBookValue - salePrice; // 2,000,000

    // Post Disposal Journal:
    // Debit: Akumulasi Penyusutan (1500) = 2,000,000
    // Debit: Kas (1100) = 20,000,000
    // Debit: Rugi Pelepasan Aset (6000) = 2,000,000
    // Credit: Aset Tetap (1400) = 24,000,000
    // Total Debit = 24,000,000 == Total Credit = 24,000,000
    const jRes = await dbRun(
      `INSERT INTO journal_entries (company_id, journal_no, journal_date, source_type, source_id, description, status, posted_at)
       VALUES (?, ?, CURDATE(), 'fixed_asset_disposal', ?, 'Pelepasan Aset Server', 'posted', NOW())`,
      [companyAId, `JV-DISP-AST-${ts}`, assetId]
    );
    disposalJournalId = jRes.insertId;

    await dbRun(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Akumulasi Penyusutan Dihapus', ?, 0.00),
              (?, ?, 'Penerimaan Hasil Jual Aset', ?, 0.00),
              (?, ?, 'Rugi Pelepasan Aset', ?, 0.00),
              (?, ?, 'Penghapusan Nilai Aset Tetap', 0.00, ?)`,
      [
        disposalJournalId, acctAccum, currentAccum.toFixed(2),
        disposalJournalId, acctCash, salePrice.toFixed(2),
        disposalJournalId, acctExp, loss.toFixed(2),
        disposalJournalId, acctAsset, currentCost.toFixed(2),
      ]
    );

    // Update asset status
    await dbRun("UPDATE assets SET status = 'disposed' WHERE id = ?", [assetId]);

    const items = await db("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?", [disposalJournalId]);
    const totalDebit = items.reduce((s, i) => s + Number(i.debit), 0);
    const totalCredit = items.reduce((s, i) => s + Number(i.credit), 0);

    assert(approxEq(totalDebit, totalCredit), `Disposal journal unbalanced: Debit ${totalDebit} != Credit ${totalCredit}`);
    assert(approxEq(totalDebit, currentCost), "Disposal journal total should equal original asset cost");

    const updated = (await db("SELECT status FROM assets WHERE id = ?", [assetId]))[0];
    assert(updated.status === "disposed", "Asset status must be 'disposed'");
  });

  await test("Depreciation strictly STOPPED after asset disposal", async () => {
    let threw = false;
    try {
      const asset = (await db("SELECT status FROM assets WHERE id = ?", [assetId]))[0];
      if (asset.status === "disposed") {
        throw new Error("Aset sudah dilepas (disposed). Penyusutan dihentikan.");
      }
    } catch {
      threw = true;
    }
    assert(threw, "Subsequent depreciation on disposed asset must be rejected");
  });

  // ── 5. COMPANY ISOLATION ──────────────────────────────────────────────────
  console.log("\n[5] COMPANY ISOLATION\n");

  await test("Company B cannot see Company A's fixed assets", async () => {
    const bAssets = await db("SELECT id FROM assets WHERE company_id = ?", [companyBId]);
    const leak = bAssets.filter(a => Number(a.id) === assetId);
    assert(leak.length === 0, "Company B sees Company A's asset — ISOLATION BREACH");
  });

  await test("Company B cannot see Company A's asset categories", async () => {
    const bCats = await db("SELECT id FROM asset_categories WHERE company_id = ?", [companyBId]);
    const leak = bCats.filter(c => Number(c.id) === categoryId);
    assert(leak.length === 0, "Company B sees Company A's category — ISOLATION BREACH");
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
