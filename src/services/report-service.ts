/**
 * ERP Manajemen — Central Reporting & Dashboard Service (Phase 15)
 *
 * Single Source of Truth:
 *   All financial metrics are derived directly from the Accounting Engine (GL, Journals)
 *   and authoritative subledgers (AR, AP, Inventory Stocks).
 *
 * Invariants:
 *   - Company isolation strictly enforced on every query
 *   - Double-entry balance sheet equation: Assets === Liabilities + Equity
 *   - AR / AP aging totals reconcile 100% with open subledger balances
 *   - Inventory valuation reconciles with inventory_stocks * cost_price
 */

import { query, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutiveDashboardSummary {
  company_id: number;
  as_of_date: string;
  revenue: number;
  expense: number;
  net_profit_loss: number;
  cash_balance: number;
  bank_balance: number;
  ar_outstanding: number;
  ap_outstanding: number;
  inventory_valuation: number;
  total_products: number;
  total_customers: number;
  total_suppliers: number;
}

export interface IncomeStatementItem {
  account_id: number;
  account_code: string;
  account_name: string;
  amount: number;
}

export interface IncomeStatementReport {
  company_id: number;
  as_of_date: string;
  revenues: IncomeStatementItem[];
  expenses: IncomeStatementItem[];
  total_revenue: number;
  total_expense: number;
  net_income: number;
}

export interface BalanceSheetItem {
  account_id: number;
  account_code: string;
  account_name: string;
  amount: number;
}

export interface BalanceSheetReport {
  company_id: number;
  as_of_date: string;
  current_assets: BalanceSheetItem[];
  fixed_assets: BalanceSheetItem[];
  total_assets: number;
  liabilities: BalanceSheetItem[];
  total_liabilities: number;
  equity: BalanceSheetItem[];
  current_period_net_income: number;
  total_equity: number;
  total_liabilities_and_equity: number;
  is_balanced: boolean;
}

export interface AgingBucket {
  entity_id: number;
  entity_name: string;
  current_0_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_over_90: number;
  total_outstanding: number;
}

export interface AgingReport {
  company_id: number;
  as_of_date: string;
  report_type: 'AR' | 'AP';
  items: AgingBucket[];
  total_current: number;
  total_31_60: number;
  total_61_90: number;
  total_over_90: number;
  grand_total: number;
}

export interface StockValuationItem {
  product_id: number;
  product_code: string;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
}

export interface StockValuationReport {
  company_id: number;
  as_of_date: string;
  items: StockValuationItem[];
  total_quantity: number;
  total_valuation: number;
}

// ─── 1. Executive Dashboard Summary ───────────────────────────────────────────

export async function getExecutiveDashboardSummary(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null,
  asOfDate?: string
): Promise<ExecutiveDashboardSummary> {
  requirePermission(session, PERMISSIONS.DASHBOARD_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  // 1. Revenue & Expense from GL
  const revGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.credit - gl.debit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.account_type = 'revenue' AND gl.posting_date <= ?`,
    [companyId, targetDate]
  );
  const revenue = Math.max(0, Number(revGl?.total || 0));

  const expGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.account_type = 'expense' AND gl.posting_date <= ?`,
    [companyId, targetDate]
  );
  const expense = Math.max(0, Number(expGl?.total || 0));
  const net_profit_loss = revenue - expense;

  // 2. Cash & Bank balances
  const cashGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.code = '1100' AND gl.posting_date <= ?`,
    [companyId, targetDate]
  );
  const cash_balance = Number(cashGl?.total || 0);

  const bankGl = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(gl.debit - gl.credit), 0) AS total
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.code = '1110' AND gl.posting_date <= ?`,
    [companyId, targetDate]
  );
  const bank_balance = Number(bankGl?.total || 0);

  // 3. AR Outstanding from Subledger
  const arSub = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(balance_amount), 0) AS total
     FROM receivables
     WHERE company_id = ? AND status IN ('open', 'partial') AND invoice_date <= ?`,
    [companyId, targetDate]
  );
  const ar_outstanding = Number(arSub?.total || 0);

  // 4. AP Outstanding from Subledger
  const apSub = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(balance_amount), 0) AS total
     FROM payables
     WHERE company_id = ? AND status IN ('open', 'partial') AND invoice_date <= ?`,
    [companyId, targetDate]
  );
  const ap_outstanding = Number(apSub?.total || 0);

  // 5. Inventory Valuation from Stock Subledger
  const invSub = await queryOne<{ total_val: number; total_qty: number }>(
    `SELECT COALESCE(SUM(s.quantity * COALESCE(NULLIF(s.average_cost, 0), p.cost_price)), 0) AS total_val,
            COALESCE(SUM(s.quantity), 0) AS total_qty
     FROM stock_balances s
     JOIN products p ON s.product_id = p.id
     WHERE s.company_id = ?`,
    [companyId]
  );
  const inventory_valuation = Number(invSub?.total_val || 0);

  // 6. Master Counts
  const prodCount = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM products WHERE company_id = ?", [companyId]);
  const custCount = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM customers WHERE company_id = ?", [companyId]);
  const suppCount = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM suppliers WHERE company_id = ?", [companyId]);

  return {
    company_id: companyId,
    as_of_date: targetDate,
    revenue,
    expense,
    net_profit_loss,
    cash_balance,
    bank_balance,
    ar_outstanding,
    ap_outstanding,
    inventory_valuation,
    total_products: Number(prodCount?.c || 0),
    total_customers: Number(custCount?.c || 0),
    total_suppliers: Number(suppCount?.c || 0),
  };
}

// ─── 2. Income Statement Report ───────────────────────────────────────────────

export async function getIncomeStatementReport(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null,
  asOfDate?: string
): Promise<IncomeStatementReport> {
  requirePermission(session, [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.ACCOUNTING_VIEW]);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  const rows = await query<
    Array<{
      account_id: number;
      account_code: string;
      account_name: string;
      account_type: string;
      normal_balance: string;
      debit: number;
      credit: number;
    }>
  >(
    `SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
            a.account_type, a.normal_balance,
            COALESCE(SUM(gl.debit), 0) AS debit,
            COALESCE(SUM(gl.credit), 0) AS credit
     FROM accounts a
     LEFT JOIN general_ledger gl ON gl.account_id = a.id AND gl.posting_date <= ?
     WHERE a.company_id = ? AND a.account_type IN ('revenue', 'expense') AND a.status = 'active'
     GROUP BY a.id
     ORDER BY a.code ASC`,
    [targetDate, companyId]
  );

  const revenues: IncomeStatementItem[] = [];
  const expenses: IncomeStatementItem[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const r of rows) {
    if (r.account_type === "revenue") {
      const amt = Number(r.credit) - Number(r.debit);
      revenues.push({
        account_id: r.account_id,
        account_code: r.account_code,
        account_name: r.account_name,
        amount: amt,
      });
      totalRevenue += amt;
    } else if (r.account_type === "expense") {
      const amt = Number(r.debit) - Number(r.credit);
      expenses.push({
        account_id: r.account_id,
        account_code: r.account_code,
        account_name: r.account_name,
        amount: amt,
      });
      totalExpense += amt;
    }
  }

  return {
    company_id: companyId,
    as_of_date: targetDate,
    revenues,
    expenses,
    total_revenue: totalRevenue,
    total_expense: totalExpense,
    net_income: totalRevenue - totalExpense,
  };
}

// ─── 3. Balance Sheet Report ──────────────────────────────────────────────────

export async function getBalanceSheetReport(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null,
  asOfDate?: string
): Promise<BalanceSheetReport> {
  requirePermission(session, [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.ACCOUNTING_VIEW]);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  const acctRows = await query<
    Array<{
      account_id: number;
      account_code: string;
      account_name: string;
      account_type: string;
      normal_balance: string;
      debit: number;
      credit: number;
    }>
  >(
    `SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
            a.account_type, a.normal_balance,
            COALESCE(SUM(gl.debit), 0) AS debit,
            COALESCE(SUM(gl.credit), 0) AS credit
     FROM accounts a
     LEFT JOIN general_ledger gl ON gl.account_id = a.id AND gl.posting_date <= ?
     WHERE a.company_id = ? AND a.status = 'active'
     GROUP BY a.id
     ORDER BY a.code ASC`,
    [targetDate, companyId]
  );

  const current_assets: BalanceSheetItem[] = [];
  const fixed_assets: BalanceSheetItem[] = [];
  const liabilities: BalanceSheetItem[] = [];
  const equity: BalanceSheetItem[] = [];

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const r of acctRows) {
    const dr = Number(r.debit);
    const cr = Number(r.credit);

    if (r.account_type === "asset") {
      // Normal debit assets increase Total Assets; Credit normal assets (Contra-assets like 1500 Akumulasi) decrease Total Assets
      const bal = dr - cr;
      if (r.account_code.startsWith("14") || r.account_code.startsWith("15")) {
        fixed_assets.push({
          account_id: r.account_id,
          account_code: r.account_code,
          account_name: r.account_name,
          amount: Math.abs(bal),
        });
      } else {
        current_assets.push({
          account_id: r.account_id,
          account_code: r.account_code,
          account_name: r.account_name,
          amount: bal,
        });
      }
      totalAssets += bal;
    } else if (r.account_type === "liability") {
      const bal = cr - dr;
      liabilities.push({
        account_id: r.account_id,
        account_code: r.account_code,
        account_name: r.account_name,
        amount: bal,
      });
      totalLiabilities += bal;
    } else if (r.account_type === "equity") {
      const bal = cr - dr;
      equity.push({
        account_id: r.account_id,
        account_code: r.account_code,
        account_name: r.account_name,
        amount: bal,
      });
      totalEquity += bal;
    } else if (r.account_type === "revenue") {
      totalRevenue += cr - dr;
    } else if (r.account_type === "expense") {
      totalExpense += dr - cr;
    }
  }

  const currentPeriodNetIncome = totalRevenue - totalExpense;
  const grandEquity = totalEquity + currentPeriodNetIncome;
  const totalLiabEq = totalLiabilities + grandEquity;
  const is_balanced = Math.abs(totalAssets - totalLiabEq) < 0.05;

  return {
    company_id: companyId,
    as_of_date: targetDate,
    current_assets,
    fixed_assets,
    total_assets: totalAssets,
    liabilities,
    total_liabilities: totalLiabilities,
    equity,
    current_period_net_income: currentPeriodNetIncome,
    total_equity: grandEquity,
    total_liabilities_and_equity: totalLiabEq,
    is_balanced,
  };
}

// ─── 4. AR & AP Aging Reports ─────────────────────────────────────────────────

export async function getAgingReport(
  session: UserSessionPayload | null,
  reportType: 'AR' | 'AP',
  requestedCompanyId?: number | string | null,
  asOfDate?: string
): Promise<AgingReport> {
  requirePermission(session, [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.SALES_VIEW, PERMISSIONS.PURCHASING_VIEW]);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  let rawRows: Array<{
    entity_id: number;
    entity_name: string;
    due_date: string;
    balance_amount: number;
  }>;

  if (reportType === "AR") {
    rawRows = await query(
      `SELECT r.customer_id AS entity_id, c.name AS entity_name, r.due_date, r.balance_amount
       FROM receivables r
       JOIN customers c ON r.customer_id = c.id
       WHERE r.company_id = ? AND r.status IN ('open', 'partial') AND r.invoice_date <= ?`,
      [companyId, targetDate]
    );
  } else {
    rawRows = await query(
      `SELECT p.supplier_id AS entity_id, s.name AS entity_name, p.due_date, p.balance_amount
       FROM payables p
       JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.company_id = ? AND p.status IN ('open', 'partial') AND p.invoice_date <= ?`,
      [companyId, targetDate]
    );
  }

  const entityMap = new Map<number, AgingBucket>();
  const now = new Date(targetDate).getTime();

  let grandCur = 0;
  let grand30 = 0;
  let grand60 = 0;
  let grand90 = 0;
  let grandTotal = 0;

  for (const r of rawRows) {
    const bal = Number(r.balance_amount);
    const dueDate = new Date(r.due_date).getTime();
    const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

    let item = entityMap.get(r.entity_id);
    if (!item) {
      item = {
        entity_id: r.entity_id,
        entity_name: r.entity_name,
        current_0_30: 0,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_over_90: 0,
        total_outstanding: 0,
      };
      entityMap.set(r.entity_id, item);
    }

    if (diffDays <= 30) {
      item.current_0_30 += bal;
      grandCur += bal;
    } else if (diffDays <= 60) {
      item.aging_31_60 += bal;
      grand30 += bal;
    } else if (diffDays <= 90) {
      item.aging_61_90 += bal;
      grand60 += bal;
    } else {
      item.aging_over_90 += bal;
      grand90 += bal;
    }

    item.total_outstanding += bal;
    grandTotal += bal;
  }

  return {
    company_id: companyId,
    as_of_date: targetDate,
    report_type: reportType,
    items: Array.from(entityMap.values()),
    total_current: grandCur,
    total_31_60: grand30,
    total_61_90: grand60,
    total_over_90: grand90,
    grand_total: grandTotal,
  };
}

// ─── 5. Stock Valuation Report ────────────────────────────────────────────────

export async function getStockValuationReport(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<StockValuationReport> {
  requirePermission(session, [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.REPORTS_VIEW]);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const asOfDate = new Date().toISOString().split("T")[0];

  const rows = await query<StockValuationItem[]>(
    `SELECT p.id AS product_id, p.code AS product_code, p.name AS product_name,
            w.id AS warehouse_id, w.name AS warehouse_name,
            s.quantity, COALESCE(NULLIF(s.average_cost, 0), p.cost_price) AS unit_price,
            (s.quantity * COALESCE(NULLIF(s.average_cost, 0), p.cost_price)) AS total_value
     FROM stock_balances s
     JOIN products p ON s.product_id = p.id
     JOIN warehouses w ON s.warehouse_id = w.id
     WHERE s.company_id = ?
     ORDER BY p.name ASC`,
    [companyId]
  );

  let totalQty = 0;
  let totalVal = 0;

  for (const r of rows) {
    totalQty += Number(r.quantity);
    totalVal += Number(r.total_value);
  }

  return {
    company_id: companyId,
    as_of_date: asOfDate,
    items: rows,
    total_quantity: totalQty,
    total_valuation: totalVal,
  };
}

// ─── 6. Analytical Dashboard Data ─────────────────────────────────────────────

export interface FinancialTrendPoint {
  month: string;
  revenue: number;
  expense: number;
}

/**
 * Fetch revenue and expense trend for the last 6 months from GL.
 */
export async function getFinancialTrendData(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<FinancialTrendPoint[]> {
  requirePermission(session, PERMISSIONS.DASHBOARD_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  // Get data for the last 6 months
  const rows = await query<Array<{ month_str: string; type: string; total: number }>>(
    `SELECT
       DATE_FORMAT(gl.posting_date, '%b') AS month_str,
       a.account_type AS type,
       SUM(CASE
         WHEN a.account_type = 'revenue' THEN (gl.credit - gl.debit)
         WHEN a.account_type = 'expense' THEN (gl.debit - gl.credit)
         ELSE 0
       END) AS total,
       DATE_FORMAT(gl.posting_date, '%Y-%m') AS sort_key
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ?
       AND a.account_type IN ('revenue', 'expense')
       AND gl.posting_date >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
     GROUP BY sort_key, month_str, a.account_type
     ORDER BY sort_key ASC`,
    [companyId]
  );

  // Pivot data into month-based points
  const monthMap = new Map<string, FinancialTrendPoint>();

  // Initialize last 6 months with zeros to ensure they appear in chart
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mStr = d.toLocaleString('en-US', { month: 'short' });
    monthMap.set(mStr, { month: mStr, revenue: 0, expense: 0 });
  }

  for (const r of rows) {
    const point = monthMap.get(r.month_str) || { month: r.month_str, revenue: 0, expense: 0 };
    if (r.type === 'revenue') point.revenue = Math.max(0, Number(r.total));
    if (r.type === 'expense') point.expense = Math.max(0, Number(r.total));
    monthMap.set(r.month_str, point);
  }

  return Array.from(monthMap.values());
}

export interface InventoryCategoryPoint {
  name: string;
  value: number;
}

/**
 * Fetch inventory valuation distribution by category.
 */
export async function getInventoryCompositionData(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<InventoryCategoryPoint[]> {
  requirePermission(session, PERMISSIONS.DASHBOARD_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const rows = await query<Array<{ name: string; total_val: number }>>(
    `SELECT
       COALESCE(cat.name, 'Uncategorized') AS name,
       SUM(sb.quantity * COALESCE(NULLIF(sb.average_cost, 0), p.cost_price)) AS total_val
     FROM stock_balances sb
     JOIN products p ON sb.product_id = p.id
     LEFT JOIN product_categories cat ON p.category_id = cat.id
     WHERE sb.company_id = ?
     GROUP BY cat.id, cat.name
     HAVING total_val > 0
     ORDER BY total_val DESC`,
    [companyId]
  );

  return rows.map(r => ({
    name: r.name,
    value: Math.round(Number(r.total_val)),
  }));
}
