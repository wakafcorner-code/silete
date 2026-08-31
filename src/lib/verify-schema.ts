import { query } from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";

export const REQUIRED_BASELINE_TABLES = [
  // Organization & Security
  "companies",
  "branches",
  "warehouses",
  "users",
  "roles",
  "permissions",
  "user_roles",
  // Master Data
  "customers",
  "suppliers",
  "employees",
  "product_categories",
  "products",
  // Inventory
  "inventory_transactions",
  "stock_balances",
  "stock_opnames",
  "stock_adjustments",
  // Purchasing
  "purchase_requests",
  "purchase_orders",
  "purchase_items",
  "goods_receipts",
  "goods_receipt_items",
  // Sales
  "sales_orders",
  "sales_items",
  "deliveries",
  "delivery_items",
  // Finance & Invoices
  "invoices",
  "invoice_items",
  "cash_accounts",
  "cash_transactions",
  "bank_accounts",
  "bank_transactions",
  "expense_categories",
  "expenses",
  "expense_approvals",
  "payments",
  "payment_allocations",
  "receivables",
  "payables",
  // Accounting
  "accounts",
  "financial_periods",
  "journal_entries",
  "journal_entry_items",
  "general_ledger",
  // Fixed Assets
  "asset_categories",
  "assets",
  "asset_depreciations",
  // Intercompany
  "intercompany_transactions",
  "intercompany_entries",
  "intercompany_settlements",
  // Audit & System
  "audit_logs",
  "attachments",
  "notifications",
] as const;

export interface SchemaVerificationReport {
  database: string;
  totalRequiredTables: number;
  existingTablesCount: number;
  missingTables: string[];
  tablesFound: string[];
  foreignKeyCount: number;
  isValid: boolean;
  timestamp: string;
}

/**
 * Verify database schema against the required baseline
 */
export async function verifyDatabaseSchema(): Promise<SchemaVerificationReport> {
  const database = process.env.DB_NAME || "erp_manajemen";

  // 1. Fetch all tables
  const tableRows = await query<RowDataPacket[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
    [database]
  );
  const existingTables = new Set(tableRows.map((r) => String((r as { TABLE_NAME?: string; table_name?: string }).table_name || (r as { TABLE_NAME?: string }).TABLE_NAME).toLowerCase()));

  const missingTables: string[] = [];
  const tablesFound: string[] = [];

  for (const table of REQUIRED_BASELINE_TABLES) {
    if (existingTables.has(table.toLowerCase())) {
      tablesFound.push(table);
    } else {
      missingTables.push(table);
    }
  }

  // 2. Count foreign keys in the database
  const fkRows = await query<RowDataPacket[]>(
    "SELECT COUNT(*) as count FROM information_schema.table_constraints WHERE table_schema = ? AND constraint_type = 'FOREIGN KEY'",
    [database]
  );
  const foreignKeyCount = fkRows[0] ? Number((fkRows[0] as { count: number }).count) : 0;

  return {
    database,
    totalRequiredTables: REQUIRED_BASELINE_TABLES.length,
    existingTablesCount: tablesFound.length,
    missingTables,
    tablesFound,
    foreignKeyCount,
    isValid: missingTables.length === 0,
    timestamp: new Date().toISOString(),
  };
}
