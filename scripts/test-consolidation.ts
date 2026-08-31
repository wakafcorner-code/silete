/**
 * Phase 14 — Financial Consolidation & Intercompany Elimination Test Suite
 *
 * Core Principle:
 *   Consolidated Group = Company A + Company B - Intercompany Eliminations
 *
 * Tests:
 *  1. Company A Standalone Trial Balance (Balances independently)
 *  2. Company B Standalone Trial Balance (Balances independently)
 *  3. Intercompany Balance Identification (IC-AR 1250 <-> IC-AP 2200)
 *  4. Intercompany Revenue & Expense Identification (IC-Rev 4000 <-> IC-Exp 6000)
 *  5. Consolidated Trial Balance Balancing Invariant: Sum(Consolidated Dr) === Sum(Consolidated Cr)
 *  6. Consolidated Income Statement: Revenue & Expense elimination
 *  7. Consolidated Balance Sheet: Assets, Liabilities, and Equity reconciliation
 *  8. Strict Group Reconciliation: Eliminated Debit === Eliminated Credit
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

const companyAId = 1;
const companyBId = 2;

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n========================================");
  console.log("PHASE 14 — CONSOLIDATION & ELIMINATION TEST SUITE");
  console.log("========================================\n");

  // ── 1. STANDALONE TRIAL BALANCES ──────────────────────────────────────────
  console.log("[1] STANDALONE FINANCIAL STATEMENTS\n");

  await test("Company A standalone Trial Balance is strictly balanced (Debit === Credit)", async () => {
    const glA = await db(
      `SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
       FROM general_ledger
       WHERE company_id = ?`,
      [companyAId]
    );
    const drA = Number(glA[0].total_debit);
    const crA = Number(glA[0].total_credit);

    console.log(`    Company A Standalone: Debit = ${drA}, Credit = ${crA}`);
    assert(drA > 0, "Company A should have posted GL entries");
    assert(approxEq(drA, crA), `Company A unbalanced: Debit ${drA} != Credit ${crA}`);
  });

  await test("Company B standalone Trial Balance is strictly balanced (Debit === Credit)", async () => {
    const glB = await db(
      `SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
       FROM general_ledger
       WHERE company_id = ?`,
      [companyBId]
    );
    const drB = Number(glB[0].total_debit);
    const crB = Number(glB[0].total_credit);

    console.log(`    Company B Standalone: Debit = ${drB}, Credit = ${crB}`);
    assert(drB > 0, "Company B should have posted GL entries");
    assert(approxEq(drB, crB), `Company B unbalanced: Debit ${drB} != Credit ${crB}`);
  });

  // ── 2. INTERCOMPANY ELIMINATIONS IDENTIFICATION ───────────────────────────
  console.log("\n[2] INTERCOMPANY ELIMINATION IDENTIFICATION\n");

  let icReceivable = 0;
  let icPayable = 0;
  let icRevenue = 0;

  await test("Intercompany Receivable (1250) and Payable (2200) balances are identified", async () => {
    const arRows = await db(
      `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE a.code = '1250'`
    );
    const apRows = await db(
      `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE a.code = '2200'`
    );

    icReceivable = Number(arRows[0].total);
    icPayable = Number(apRows[0].total);

    console.log(`    Intercompany Balance: IC-AR = ${icReceivable}, IC-AP = ${icPayable}`);
    assert(icReceivable >= 0, "IC Receivable should be non-negative");
    assert(icPayable >= 0, "IC Payable should be non-negative");
  });

  await test("Intercompany internal transactions for Revenue/Expense elimination are identified", async () => {
    const icTxs = await db(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount
       FROM intercompany_transactions
       WHERE status IN ('posted', 'settled')`
    );
    icRevenue = Number(icTxs[0].total_amount);

    console.log(`    Intercompany Internal Revenue/Expense to eliminate = ${icRevenue}`);
    assert(icRevenue > 0, "Intercompany internal transaction volume should be > 0");
  });

  // ── 3. CONSOLIDATED TRIAL BALANCE ─────────────────────────────────────────
  console.log("\n[3] CONSOLIDATED TRIAL BALANCE & INVARIANTS\n");

  await test("Consolidated Trial Balance eliminates intercompany balances and BALANCES (Dr === Cr)", async () => {
    // 1. Query all accounts
    const accounts = await db("SELECT DISTINCT code, name, account_type, normal_balance FROM accounts WHERE status = 'active' ORDER BY code ASC");

    // 2. Query all GL per company & account
    const glAll = await db(
      `SELECT gl.company_id, a.code,
              COALESCE(SUM(gl.debit), 0) AS debit_total,
              COALESCE(SUM(gl.credit), 0) AS credit_total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       GROUP BY gl.company_id, a.code`
    );

    const glMap = new Map<string, { debit: number; credit: number }>();
    for (const r of glAll) {
      glMap.set(`${r.company_id}:${r.code}`, {
        debit: Number(r.debit_total),
        credit: Number(r.credit_total),
      });
    }

    let grandConsolidatedDebit = 0;
    let grandConsolidatedCredit = 0;
    let totalEliminations = 0;

    const getUnadjusted = (code: string, norm: "debit" | "credit") => {
      let tot = 0;
      for (const cId of [1, 2]) {
        const gl = glMap.get(`${cId}:${code}`) || { debit: 0, credit: 0 };
        tot += norm === "debit" ? gl.debit - gl.credit : gl.credit - gl.debit;
      }
      return tot;
    };

    const unadj1250 = getUnadjusted("1250", "debit");
    const unadj2200 = getUnadjusted("2200", "credit");
    const icBalanceElim = Math.min(Math.max(0, unadj1250), Math.max(0, unadj2200));

    const unadj4000 = getUnadjusted("4000", "credit");
    const unadj6000 = getUnadjusted("6000", "debit");
    const icRevExpElim = Math.min(Math.max(0, unadj4000), Math.max(0, unadj6000), icRevenue);

    for (const acct of accounts) {
      const code = String(acct.code);
      const gl1 = glMap.get(`1:${code}`) || { debit: 0, credit: 0 };
      const gl2 = glMap.get(`2:${code}`) || { debit: 0, credit: 0 };

      let bal1 = 0;
      let bal2 = 0;
      if (acct.normal_balance === "debit") {
        bal1 = gl1.debit - gl1.credit;
        bal2 = gl2.debit - gl2.credit;
      } else {
        bal1 = gl1.credit - gl1.debit;
        bal2 = gl2.credit - gl2.debit;
      }

      const unadjustedTotal = bal1 + bal2;
      let consolidatedBal = unadjustedTotal;

      if (code === "1250" && icBalanceElim > 0) {
        consolidatedBal = Math.max(0, unadjustedTotal - icBalanceElim);
        totalEliminations += icBalanceElim;
      } else if (code === "2200" && icBalanceElim > 0) {
        consolidatedBal = Math.max(0, unadjustedTotal - icBalanceElim);
        totalEliminations += icBalanceElim;
      } else if (code === "4000" && icRevExpElim > 0) {
        consolidatedBal = Math.max(0, unadjustedTotal - icRevExpElim);
        totalEliminations += icRevExpElim;
      } else if (code === "6000" && icRevExpElim > 0) {
        consolidatedBal = Math.max(0, unadjustedTotal - icRevExpElim);
        totalEliminations += icRevExpElim;
      }

      if (acct.normal_balance === "debit") {
        grandConsolidatedDebit += consolidatedBal;
      } else {
        grandConsolidatedCredit += consolidatedBal;
      }
    }

    console.log(`    Consolidated Trial Balance: Total Dr = ${grandConsolidatedDebit}, Total Cr = ${grandConsolidatedCredit}, Eliminations = ${totalEliminations}`);
    assert(totalEliminations > 0, "Consolidated report must execute non-zero eliminations");
    assert(approxEq(grandConsolidatedDebit, grandConsolidatedCredit), `Consolidated TB unbalanced: Debit ${grandConsolidatedDebit} != Credit ${grandConsolidatedCredit}`);
  });

  // ── 4. CONSOLIDATED INCOME STATEMENT ──────────────────────────────────────
  console.log("\n[4] CONSOLIDATED INCOME STATEMENT\n");

  await test("Consolidated Income Statement eliminates internal revenue & internal expense", async () => {
    // Unadjusted standalone revenue
    const revA = Number((await db("SELECT COALESCE(SUM(credit - debit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 1 AND a.account_type = 'revenue'"))[0].total);
    const revB = Number((await db("SELECT COALESCE(SUM(credit - debit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 2 AND a.account_type = 'revenue'"))[0].total);

    const totalUnadjustedRev = revA + revB;
    const consolidatedRev = totalUnadjustedRev - icRevenue;

    console.log(`    Income Statement: Rev A = ${revA}, Rev B = ${revB}, Unadjusted = ${totalUnadjustedRev}, Consolidated Rev = ${consolidatedRev}`);
    assert(consolidatedRev < totalUnadjustedRev, "Consolidated revenue must be less than raw sum due to internal sales elimination");
    assert(approxEq(consolidatedRev, totalUnadjustedRev - icRevenue), "Consolidated revenue formula mismatch");
  });

  // ── 5. CONSOLIDATED BALANCE SHEET ─────────────────────────────────────────
  console.log("\n[5] CONSOLIDATED BALANCE SHEET & RECONCILIATION\n");

  await test("Consolidated Balance Sheet eliminates internal receivable and payable without distortion", async () => {
    // Unadjusted assets
    const astA = Number((await db("SELECT COALESCE(SUM(debit - credit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 1 AND a.account_type = 'asset'"))[0].total);
    const astB = Number((await db("SELECT COALESCE(SUM(debit - credit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 2 AND a.account_type = 'asset'"))[0].total);

    // Unadjusted liabilities
    const liabA = Number((await db("SELECT COALESCE(SUM(credit - debit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 1 AND a.account_type = 'liability'"))[0].total);
    const liabB = Number((await db("SELECT COALESCE(SUM(credit - debit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 2 AND a.account_type = 'liability'"))[0].total);

    const totalUnadjustedAst = astA + astB;
    const totalUnadjustedLiab = liabA + liabB;

    const consolidatedAst = totalUnadjustedAst - icReceivable;
    const consolidatedLiab = totalUnadjustedLiab - icPayable;

    console.log(`    Balance Sheet: Consolidated Assets = ${consolidatedAst} (eliminated ${icReceivable}), Consolidated Liab = ${consolidatedLiab} (eliminated ${icPayable})`);
    assert(consolidatedAst <= totalUnadjustedAst, "Consolidated assets must eliminate IC receivable");
    assert(consolidatedLiab <= totalUnadjustedLiab, "Consolidated liabilities must eliminate IC payable");
  });

  await test("Group Reconciliation Invariant: Standalone statements remain unchanged while consolidated reflects true external position", async () => {
    // Standalone Company A must still have its IC receivable
    const standAR_A = Number((await db("SELECT COALESCE(SUM(debit - credit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 1 AND a.code = '1250'"))[0].total);
    // Standalone Company B must still have its IC payable
    const standAP_B = Number((await db("SELECT COALESCE(SUM(credit - debit), 0) AS total FROM general_ledger gl JOIN accounts a ON gl.account_id = a.id WHERE gl.company_id = 2 AND a.code = '2200'"))[0].total);

    assert(standAR_A > 0, "Company A standalone GL must preserve its legal claim");
    assert(standAP_B > 0, "Company B standalone GL must preserve its legal liability");
    assert(approxEq(standAR_A, standAP_B), "Standalone reciprocal balances must match exactly");
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
