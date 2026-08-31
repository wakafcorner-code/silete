/**
 * ERP Manajemen — Consolidation & Elimination Service (Phase 14)
 *
 * Core Principle:
 *   Consolidated Group = Company A + Company B - Intercompany Eliminations
 *
 * Eliminations Handled:
 *   1. Intercompany Receivable (1250) <-> Intercompany Payable (2200)
 *   2. Intercompany Revenue (4000)   <-> Intercompany Expense (6000)
 *
 * Invariants:
 *   - Consolidated Trial Balance must balance (Sum(Debit) === Sum(Credit))
 *   - Consolidated Balance Sheet must balance (Assets === Liabilities + Equity)
 *   - Standalone financials remain pristine while group reports eliminate internal balances
 *   - Intercompany eliminations are fully reconcilable and auditable
 */

import { query, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { PERMISSIONS } from "@/config/permissions";
import {
  Account,
  ConsolidatedTrialBalanceReport,
  ConsolidatedTrialBalanceRow,
  ConsolidatedIncomeStatement,
  ConsolidatedBalanceSheet,
  IntercompanyEliminationDetail,
} from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveCompanies(): Promise<Array<{ id: number; name: string; code: string }>> {
  return query<Array<{ id: number; name: string; code: string }>>(
    "SELECT id, name, code FROM companies WHERE status = 'active' ORDER BY id ASC"
  );
}

// ─── 1. Consolidated Trial Balance ────────────────────────────────────────────

export async function getConsolidatedTrialBalance(
  session: UserSessionPayload | null,
  asOfDate?: string
): Promise<ConsolidatedTrialBalanceReport> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];
  const companies = await getActiveCompanies();
  const companyIds = companies.map((c) => c.id);

  if (companyIds.length === 0) {
    return {
      as_of_date: targetDate,
      companies: [],
      rows: [],
      total_debit: 0,
      total_credit: 0,
      total_eliminations: 0,
      is_balanced: true,
    };
  }

  // 1. Get all distinct accounts across companies
  const allAccounts = await query<Account[]>(
    `SELECT DISTINCT code, name, account_type, normal_balance
     FROM accounts
     WHERE status = 'active'
     ORDER BY code ASC`
  );

  // 2. Query GL balances per company per account up to targetDate
  const glBalances = await query<
    Array<{ company_id: number; code: string; debit_total: number; credit_total: number }>
  >(
    `SELECT gl.company_id, a.code,
            COALESCE(SUM(gl.debit), 0) AS debit_total,
            COALESCE(SUM(gl.credit), 0) AS credit_total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.posting_date <= ?
     GROUP BY gl.company_id, a.code`,
    [targetDate]
  );

  // 3. Query Intercompany Transactions up to targetDate for Revenue/Expense elimination
  const icTransactions = await query<Array<{ total_ic_amount: number }>>(
    `SELECT COALESCE(SUM(amount), 0) AS total_ic_amount
     FROM intercompany_transactions
     WHERE status IN ('posted', 'settled') AND transaction_date <= ?`,
    [targetDate]
  );
  const totalICAmount = Number(icTransactions[0]?.total_ic_amount || 0);

  // Index GL balances by `companyId:accountCode`
  const glMap = new Map<string, { debit: number; credit: number }>();
  for (const row of glBalances) {
    glMap.set(`${row.company_id}:${row.code}`, {
      debit: Number(row.debit_total),
      credit: Number(row.credit_total),
    });
  }

  const rows: ConsolidatedTrialBalanceRow[] = [];
  let grandConsolidatedDebit = 0;
  let grandConsolidatedCredit = 0;
  let totalEliminations = 0;
  // Pre-calculate unadjusted balances for paired accounts to ensure balanced eliminations
  const getUnadjusted = (code: string, norm: "debit" | "credit") => {
    let tot = 0;
    for (const c of companies) {
      const gl = glMap.get(`${c.id}:${code}`) || { debit: 0, credit: 0 };
      tot += norm === "debit" ? gl.debit - gl.credit : gl.credit - gl.debit;
    }
    return tot;
  };

  const unadj1250 = getUnadjusted("1250", "debit");
  const unadj2200 = getUnadjusted("2200", "credit");
  const icBalanceElim = Math.min(Math.max(0, unadj1250), Math.max(0, unadj2200));

  const unadj4000 = getUnadjusted("4000", "credit");
  const unadj6000 = getUnadjusted("6000", "debit");
  const icRevExpElim = Math.min(Math.max(0, unadj4000), Math.max(0, unadj6000), totalICAmount);

  for (const acct of allAccounts) {
    const companyBalances: Record<number, number> = {};
    let unadjustedTotal = 0;

    for (const c of companies) {
      const gl = glMap.get(`${c.id}:${acct.code}`) || { debit: 0, credit: 0 };
      let bal = 0;
      if (acct.normal_balance === "debit") {
        bal = gl.debit - gl.credit;
      } else {
        bal = gl.credit - gl.debit;
      }
      companyBalances[c.id] = bal;
      unadjustedTotal += bal;
    }

    let elimDebit = 0;
    let elimCredit = 0;
    let consolidatedBal = unadjustedTotal;

    // Apply Elimination Rules (strictly balanced double-entry):
    // Rule 1: Piutang Intercompany (1250) -> eliminated via Credit
    if (acct.code === "1250" && icBalanceElim > 0) {
      elimCredit = icBalanceElim;
      consolidatedBal = Math.max(0, unadjustedTotal - elimCredit);
      totalEliminations += elimCredit;
    }
    // Rule 2: Hutang Intercompany (2200) -> eliminated via Debit
    else if (acct.code === "2200" && icBalanceElim > 0) {
      elimDebit = icBalanceElim;
      consolidatedBal = Math.max(0, unadjustedTotal - elimDebit);
      totalEliminations += elimDebit;
    }
    // Rule 3: Pendapatan Intercompany (4000) -> eliminated via Debit
    else if (acct.code === "4000" && icRevExpElim > 0) {
      elimDebit = icRevExpElim;
      consolidatedBal = Math.max(0, unadjustedTotal - elimDebit);
      totalEliminations += elimDebit;
    }
    // Rule 4: Beban Intercompany (6000) -> eliminated via Credit
    else if (acct.code === "6000" && icRevExpElim > 0) {
      elimCredit = icRevExpElim;
      consolidatedBal = Math.max(0, unadjustedTotal - elimCredit);
      totalEliminations += elimCredit;
    }

    if (acct.normal_balance === "debit") {
      grandConsolidatedDebit += consolidatedBal;
    } else {
      grandConsolidatedCredit += consolidatedBal;
    }

    rows.push({
      account_code: acct.code,
      account_name: acct.name,
      account_type: acct.account_type,
      normal_balance: acct.normal_balance,
      company_balances: companyBalances,
      unadjusted_total: unadjustedTotal,
      elimination_debit: elimDebit,
      elimination_credit: elimCredit,
      consolidated_balance: consolidatedBal,
    });
  }

  const is_balanced = Math.abs(grandConsolidatedDebit - grandConsolidatedCredit) < 0.05;

  return {
    as_of_date: targetDate,
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    rows,
    total_debit: grandConsolidatedDebit,
    total_credit: grandConsolidatedCredit,
    total_eliminations: totalEliminations,
    is_balanced,
  };
}

// ─── 2. Consolidated Income Statement ─────────────────────────────────────────

export async function getConsolidatedIncomeStatement(
  session: UserSessionPayload | null,
  asOfDate?: string
): Promise<ConsolidatedIncomeStatement> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];
  const companies = await getActiveCompanies();

  // Standalone revenue & expenses
  const revStandalone: Record<number, number> = {};
  const expStandalone: Record<number, number> = {};
  const netStandalone: Record<number, number> = {};

  let totalUnadjustedRev = 0;
  let totalUnadjustedExp = 0;

  for (const c of companies) {
    const revGl = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.account_type = 'revenue' AND gl.posting_date <= ?`,
      [c.id, targetDate]
    );
    const expGl = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.account_type = 'expense' AND gl.posting_date <= ?`,
      [c.id, targetDate]
    );

    const r = Math.max(0, Number(revGl?.total || 0));
    const e = Math.max(0, Number(expGl?.total || 0));

    revStandalone[c.id] = r;
    expStandalone[c.id] = e;
    netStandalone[c.id] = r - e;

    totalUnadjustedRev += r;
    totalUnadjustedExp += e;
  }

  // Intercompany Revenue / Expense Eliminations
  const icTxs = await query<
    Array<{
      id: number;
      source_company_id: number;
      destination_company_id: number;
      amount: number;
      description: string;
    }>
  >(
    `SELECT id, source_company_id, destination_company_id, amount, description
     FROM intercompany_transactions
     WHERE status IN ('posted', 'settled') AND transaction_date <= ?`,
    [targetDate]
  );

  const eliminations: IntercompanyEliminationDetail[] = [];
  let eliminatedRevExp = 0;

  for (const tx of icTxs) {
    const amt = Number(tx.amount);
    eliminatedRevExp += amt;

    eliminations.push({
      elimination_type: "revenue_expense",
      source_company_id: tx.source_company_id,
      source_company_name: `Company #${tx.source_company_id}`,
      destination_company_id: tx.destination_company_id,
      destination_company_name: `Company #${tx.destination_company_id}`,
      account_code: "4000/6000",
      account_name: "Eliminasi Pendapatan & Beban Intercompany",
      eliminated_debit: amt,
      eliminated_credit: amt,
      description: `Eliminasi transaksi internal: ${tx.description || `IC #${tx.id}`}`,
    });
  }

  const consolidatedRev = Math.max(0, totalUnadjustedRev - eliminatedRevExp);
  const consolidatedExp = Math.max(0, totalUnadjustedExp - eliminatedRevExp);
  const consolidatedNet = consolidatedRev - consolidatedExp;

  return {
    as_of_date: targetDate,
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    revenue: {
      standalone: revStandalone,
      unadjusted_total: totalUnadjustedRev,
      eliminated: eliminatedRevExp,
      consolidated: consolidatedRev,
    },
    expense: {
      standalone: expStandalone,
      unadjusted_total: totalUnadjustedExp,
      eliminated: eliminatedRevExp,
      consolidated: consolidatedExp,
    },
    net_income: {
      standalone: netStandalone,
      unadjusted_total: totalUnadjustedRev - totalUnadjustedExp,
      consolidated: consolidatedNet,
    },
    eliminations,
  };
}

// ─── 3. Consolidated Balance Sheet ────────────────────────────────────────────

export async function getConsolidatedBalanceSheet(
  session: UserSessionPayload | null,
  asOfDate?: string
): Promise<ConsolidatedBalanceSheet> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];
  const companies = await getActiveCompanies();

  // Intercompany Receivable / Payable to eliminate
  const icArGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE a.code = '1250' AND gl.posting_date <= ?`,
    [targetDate]
  );
  const eliminatedIC_AR = Math.max(0, Number(icArGl?.total || 0));

  const icApGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE a.code = '2200' AND gl.posting_date <= ?`,
    [targetDate]
  );
  const eliminatedIC_AP = Math.max(0, Number(icApGl?.total || 0));

  const eliminations: IntercompanyEliminationDetail[] = [];
  if (eliminatedIC_AR > 0 || eliminatedIC_AP > 0) {
    eliminations.push({
      elimination_type: "receivable_payable",
      source_company_id: 1,
      source_company_name: "Company A",
      destination_company_id: 2,
      destination_company_name: "Company B",
      account_code: "1250/2200",
      account_name: "Eliminasi Piutang & Hutang Intercompany",
      eliminated_debit: eliminatedIC_AP,
      eliminated_credit: eliminatedIC_AR,
      description: "Eliminasi saldo timbal balik piutang dan hutang antar perusahaan",
    });
  }

  // Standalone assets, liabilities, equity
  const assetStandalone: Record<number, number> = {};
  const liabStandalone: Record<number, number> = {};
  const eqStandalone: Record<number, number> = {};

  let totalUnadjustedAssets = 0;
  let totalUnadjustedLiabilities = 0;
  let totalUnadjustedEquity = 0;

  for (const c of companies) {
    const aGl = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.account_type = 'asset' AND gl.posting_date <= ?`,
      [c.id, targetDate]
    );
    const lGl = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.account_type = 'liability' AND gl.posting_date <= ?`,
      [c.id, targetDate]
    );
    const eGl = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
       FROM general_ledger gl
       JOIN accounts a ON gl.account_id = a.id
       WHERE gl.company_id = ? AND a.account_type = 'equity' AND gl.posting_date <= ?`,
      [c.id, targetDate]
    );

    const aVal = Number(aGl?.total || 0);
    const lVal = Number(lGl?.total || 0);
    const eVal = Number(eGl?.total || 0);

    assetStandalone[c.id] = aVal;
    liabStandalone[c.id] = lVal;
    eqStandalone[c.id] = eVal;

    totalUnadjustedAssets += aVal;
    totalUnadjustedLiabilities += lVal;
    totalUnadjustedEquity += eVal;
  }

  const consolidatedAssets = totalUnadjustedAssets - eliminatedIC_AR;
  const consolidatedLiab = totalUnadjustedLiabilities - eliminatedIC_AP;
  const consolidatedEq = totalUnadjustedEquity;

  const totalLiabEq = consolidatedLiab + consolidatedEq;
  const is_balanced = Math.abs(consolidatedAssets - totalLiabEq) < 0.05;

  return {
    as_of_date: targetDate,
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    assets: {
      standalone: assetStandalone,
      unadjusted_total: totalUnadjustedAssets,
      eliminated: eliminatedIC_AR,
      consolidated: consolidatedAssets,
      items: [],
    },
    liabilities: {
      standalone: liabStandalone,
      unadjusted_total: totalUnadjustedLiabilities,
      eliminated: eliminatedIC_AP,
      consolidated: consolidatedLiab,
      items: [],
    },
    equity: {
      standalone: eqStandalone,
      unadjusted_total: totalUnadjustedEquity,
      consolidated: consolidatedEq,
      items: [],
    },
    total_assets: consolidatedAssets,
    total_liabilities_and_equity: totalLiabEq,
    is_balanced,
    eliminations,
  };
}
