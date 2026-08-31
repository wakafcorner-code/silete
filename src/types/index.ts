/**
 * Global Type Definitions for ERP Manajemen
 */

export type Status = 'active' | 'inactive';
export type UserStatus = 'active' | 'inactive' | 'locked';

export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at?: string;
}

export interface Company extends BaseEntity {
  code: string;
  name: string;
  legal_name?: string | null;
  tax_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  currency_code: string;
  timezone: string;
  status: Status;
}

export interface Branch extends BaseEntity {
  company_id: number;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  status: Status;
}

export interface Warehouse extends BaseEntity {
  company_id: number;
  branch_id?: number | null;
  code: string;
  name: string;
  address?: string | null;
  status: Status;
}

export interface User extends BaseEntity {
  username: string;
  email: string;
  name: string;
  status: UserStatus;
  last_login_at?: string | null;
}

export interface Role {
  id: number;
  name: string;
  description?: string | null;
}

export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  badge?: string | number;
  requiredRole?: string[];
  requiredPermission?: string[];
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

// ─── Inventory Types ──────────────────────────────────────────────────────────

export type InventoryTransactionType =
  | 'receipt'
  | 'issue'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'opening'
  | 'return_in'
  | 'return_out';

export interface InventoryTransaction {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  transaction_type: InventoryTransactionType;
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  quantity: string; // DECIMAL stored as string
  unit_cost: string;
  transaction_date: string;
  notes?: string | null;
  created_by?: number | null;
  created_at: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  warehouse_name?: string;
  mitra_name?: string | null;
}

export interface StockBalance {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  quantity: string; // DECIMAL
  average_cost: string;
  updated_at: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
  warehouse_name?: string;
  total_received?: string | number;
}

export type AdjustmentStatus = 'draft' | 'posted' | 'cancelled';
export interface StockAdjustment {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  quantity_delta: string; // DECIMAL, can be negative
  reason: string;
  adjustment_date: string;
  status: AdjustmentStatus;
  created_by?: number | null;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  warehouse_name?: string;
}

export type OpnameStatus = 'draft' | 'approved' | 'posted' | 'cancelled';
export interface StockOpname {
  id: number;
  company_id: number;
  warehouse_id: number;
  opname_date: string;
  status: OpnameStatus;
  notes?: string | null;
  created_by?: number | null;
  approved_by?: number | null;
  created_at: string;
  // Joined fields
  warehouse_name?: string;
}

export type GoodsReceiptStatus = 'draft' | 'posted' | 'cancelled';
export interface GoodsReceipt {
  id: number;
  company_id: number;
  purchase_order_id?: number | null;
  warehouse_id: number;
  receipt_no: string;
  receipt_date: string;
  status: GoodsReceiptStatus;
  notes?: string | null;
  created_by?: number | null;
  // Joined fields
  warehouse_name?: string;
}

export interface GoodsReceiptItem {
  id: number;
  goods_receipt_id: number;
  product_id: number;
  quantity: string; // DECIMAL
  unit_cost: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
}

// ─── Purchasing & AP Types ───────────────────────────────────────────────────

export type PurchaseRequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'cancelled';

export interface PurchaseRequest {
  id: number;
  company_id: number;
  branch_id?: number | null;
  request_no: string;
  request_date: string;
  requested_by?: number | null;
  status: PurchaseRequestStatus;
  notes?: string | null;
  // Joined fields
  branch_name?: string;
  requested_by_name?: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'partial'
  | 'received'
  | 'closed'
  | 'cancelled';

export interface PurchaseOrder {
  id: number;
  company_id: number;
  supplier_id: number;
  branch_id?: number | null;
  po_no: string;
  order_date: string;
  expected_date?: string | null;
  status: PurchaseOrderStatus;
  subtotal: string; // DECIMAL
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
  created_by?: number | null;
  // Joined fields
  supplier_name?: string;
  supplier_code?: string;
  branch_name?: string;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: number;
  purchase_order_id: number;
  product_id: number;
  quantity: string; // DECIMAL
  unit_price: string;
  tax_amount: string;
  total_amount: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
}

export type InvoiceStatus = 'draft' | 'posted' | 'partial' | 'paid' | 'cancelled';
export type InvoiceType = 'sales' | 'purchase';

export interface Invoice {
  id: number;
  company_id: number;
  customer_id?: number | null;
  supplier_id?: number | null;
  sales_order_id?: number | null;
  purchase_order_id?: number | null;
  invoice_no: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
  created_by?: number | null;
  // Joined fields
  supplier_name?: string;
  customer_name?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_id?: number | null;
  description?: string | null;
  quantity: string;
  unit_price: string;
  tax_amount: string;
  total_amount: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
}

export type PayableStatus = 'open' | 'partial' | 'paid' | 'cancelled';

export interface Payable {
  id: number;
  company_id: number;
  supplier_id: number;
  invoice_id?: number | null;
  invoice_date: string;
  due_date?: string | null;
  original_amount: string;
  paid_amount: string;
  balance_amount: string;
  status: PayableStatus;
  // Joined fields
  supplier_name?: string;
  supplier_code?: string;
  invoice_no?: string;
}

// ─── Sales & AR Types ────────────────────────────────────────────────────────

export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partial'
  | 'delivered'
  | 'invoiced'
  | 'closed'
  | 'cancelled';

export interface SalesOrder {
  id: number;
  company_id: number;
  customer_id: number;
  branch_id?: number | null;
  order_no: string;
  order_date: string;
  status: SalesOrderStatus;
  subtotal: string; // DECIMAL
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
  created_by?: number | null;
  // Joined fields
  customer_name?: string;
  customer_code?: string;
  branch_name?: string;
  items?: SalesItem[];
}

export interface SalesItem {
  id: number;
  sales_order_id: number;
  product_id: number;
  quantity: string; // DECIMAL
  unit_price: string;
  tax_amount: string;
  total_amount: string;
  // Joined fields
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
}

export type DeliveryStatus = 'draft' | 'posted' | 'cancelled';

export interface Delivery {
  id: number;
  company_id: number;
  sales_order_id?: number | null;
  warehouse_id: number;
  delivery_no: string;
  delivery_date: string;
  status: DeliveryStatus;
  created_by?: number | null;
  // Joined fields
  warehouse_name?: string;
  order_no?: string;
  customer_name?: string;
  items?: DeliveryItem[];
}

export interface DeliveryItem {
  id: number;
  delivery_id: number;
  product_id: number;
  quantity: string; // DECIMAL
  // Joined fields
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
}

export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'cancelled';

export interface Receivable {
  id: number;
  company_id: number;
  customer_id: number;
  invoice_id?: number | null;
  invoice_date: string;
  due_date?: string | null;
  original_amount: string;
  paid_amount: string;
  balance_amount: string;
  status: ReceivableStatus;
  // Joined fields
  customer_name?: string;
  customer_code?: string;
  invoice_no?: string;
}

// ─── Cash, Bank & Expense Types ──────────────────────────────────────────────


export interface CashAccount {
  id: number;
  company_id: number;
  code: string;
  name: string;
  currency_code: string;
  opening_balance: string; // DECIMAL
  status: 'active' | 'inactive';
  current_balance?: number;
}

export type CashTransactionType = 'in' | 'out' | 'transfer';
export type FinancialTxStatus = 'draft' | 'posted' | 'cancelled';

export interface CashTransaction {
  id: number;
  company_id: number;
  cash_account_id: number;
  transaction_type: CashTransactionType;
  transaction_date: string;
  amount: string; // DECIMAL
  reference_type?: string | null;
  reference_id?: number | null;
  description?: string | null;
  status: FinancialTxStatus;
  created_by?: number | null;
  // Joined fields
  account_name?: string;
  account_code?: string;
}

export interface BankAccount {
  id: number;
  company_id: number;
  code: string;
  bank_name: string;
  account_number?: string | null;
  account_name?: string | null;
  currency_code: string;
  opening_balance: string; // DECIMAL
  status: 'active' | 'inactive';
  current_balance?: number;
}

export interface BankTransaction {
  id: number;
  company_id: number;
  bank_account_id: number;
  transaction_type: CashTransactionType;
  transaction_date: string;
  amount: string; // DECIMAL
  reference_type?: string | null;
  reference_id?: number | null;
  description?: string | null;
  status: FinancialTxStatus;
  created_by?: number | null;
  // Joined fields
  bank_name?: string;
  account_number?: string;
  account_name?: string;
}

export interface ExpenseCategory {
  id: number;
  company_id: number;
  code: string;
  name: string;
  account_id?: number | null;
}

export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'cancelled';

export interface Expense {
  id: number;
  company_id: number;
  branch_id?: number | null;
  category_id: number;
  expense_no: string;
  expense_date: string;
  description: string;
  amount: string; // DECIMAL
  status: ExpenseStatus;
  requested_by?: number | null;
  approved_by?: number | null;
  // Joined fields
  category_name?: string;
  category_code?: string;
  branch_name?: string;
  requested_by_name?: string;
  approved_by_name?: string;
}

export interface ExpenseApproval {
  id: number;
  expense_id: number;
  approver_user_id: number;
  decision: 'pending' | 'approved' | 'rejected';
  notes?: string | null;
  decided_at?: string | null;
}

// ─── Accounting Engine Types ───────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface Account {
  id: number;
  company_id: number;
  parent_id?: number | null;
  code: string;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  is_control_account: number | boolean;
  status: 'active' | 'inactive';
}

export type FinancialPeriodStatus = 'open' | 'closed';

export interface FinancialPeriod {
  id: number;
  company_id: number;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  status: FinancialPeriodStatus;
}

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';

export interface JournalEntry {
  id: number;
  company_id: number;
  period_id?: number | null;
  journal_no: string;
  journal_date: string;
  source_type?: string | null;
  source_id?: number | null;
  description?: string | null;
  status: JournalEntryStatus;
  reversal_of_id?: number | null;
  created_by?: number | null;
  posted_by?: number | null;
  posted_at?: string | null;
  // Joined fields / items
  items?: JournalEntryItem[];
  total_debit?: number;
  total_credit?: number;
}

export interface JournalEntryItem {
  id?: number;
  journal_entry_id?: number;
  account_id: number;
  description?: string | null;
  debit: string | number;
  credit: string | number;
  // Joined fields
  account_code?: string;
  account_name?: string;
  account_type?: AccountType;
  normal_balance?: NormalBalance;
}

export interface GeneralLedgerEntry {
  id: number;
  company_id: number;
  journal_entry_id: number;
  journal_entry_item_id: number;
  account_id: number;
  posting_date: string;
  debit: string; // DECIMAL
  credit: string; // DECIMAL
  // Joined fields
  account_code?: string;
  account_name?: string;
  journal_no?: string;
  description?: string | null;
}

export interface TrialBalanceRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  debit_total: number;
  credit_total: number;
  ending_balance: number;
}

export interface TrialBalanceReport {
  company_id: number;
  as_of_date: string;
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

// ─── Fixed Asset Types ───────────────────────────────────────────────────────

export interface AssetCategory {
  id: number;
  company_id: number;
  code: string;
  name: string;
  useful_life_months: number;
  depreciation_method: 'straight_line';
}

export type AssetStatus = 'active' | 'disposed' | 'inactive';

export interface Asset {
  id: number;
  company_id: number;
  category_id: number;
  asset_code: string;
  name: string;
  acquisition_date: string;
  acquisition_cost: string; // DECIMAL
  residual_value: string; // DECIMAL
  accumulated_depreciation: string; // DECIMAL
  status: AssetStatus;
  // Joined / Computed fields
  category_name?: string;
  category_code?: string;
  useful_life_months?: number;
  book_value?: number;
  monthly_depreciation?: number;
}

export type AssetDepreciationStatus = 'draft' | 'posted' | 'cancelled';

export interface AssetDepreciation {
  id: number;
  asset_id: number;
  depreciation_date: string;
  amount: string; // DECIMAL
  journal_entry_id?: number | null;
  status: AssetDepreciationStatus;
  // Joined fields
  asset_code?: string;
  asset_name?: string;
  journal_no?: string;
}

// ─── Intercompany Types ───────────────────────────────────────────────────────

export type IntercompanyTransactionType =
  | 'sale'
  | 'purchase'
  | 'service'
  | 'loan'
  | 'transfer'
  | 'expense'
  | 'other';

export type IntercompanyStatus = 'draft' | 'posted' | 'settled' | 'cancelled';

export interface IntercompanyTransaction {
  id: number;
  source_company_id: number;
  destination_company_id: number;
  transaction_no: string;
  transaction_date: string;
  transaction_type: IntercompanyTransactionType;
  amount: string; // DECIMAL
  description?: string | null;
  status: IntercompanyStatus;
  created_by?: number | null;
  // Joined fields
  source_company_name?: string;
  destination_company_name?: string;
  source_journal_no?: string;
  destination_journal_no?: string;
}

export interface IntercompanyEntry {
  id: number;
  intercompany_transaction_id: number;
  company_id: number;
  journal_entry_id?: number | null;
  role: 'source' | 'destination';
  amount: string; // DECIMAL
  // Joined fields
  company_name?: string;
  journal_no?: string;
}

export interface IntercompanySettlement {
  id: number;
  intercompany_transaction_id: number;
  settlement_date: string;
  amount: string; // DECIMAL
  status: 'draft' | 'posted' | 'cancelled';
  notes?: string | null;
}

export interface IntercompanyReconciliationReport {
  source_company_id: number;
  source_company_name: string;
  destination_company_id: number;
  destination_company_name: string;
  as_of_date: string;
  source_receivable_total: number;
  destination_payable_total: number;
  difference: number;
  is_reconciled: boolean;
  transactions: IntercompanyTransaction[];
}

// ─── Consolidation & Elimination Types ────────────────────────────────────────

export interface IntercompanyEliminationDetail {
  elimination_type: 'receivable_payable' | 'revenue_expense' | 'other';
  source_company_id: number;
  source_company_name: string;
  destination_company_id: number;
  destination_company_name: string;
  account_code: string;
  account_name: string;
  eliminated_debit: number;
  eliminated_credit: number;
  description: string;
}

export interface ConsolidatedTrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  company_balances: Record<number, number>; // company_id -> standalone ending balance
  unadjusted_total: number;
  elimination_debit: number;
  elimination_credit: number;
  consolidated_balance: number;
}

export interface ConsolidatedTrialBalanceReport {
  as_of_date: string;
  companies: Array<{ id: number; name: string }>;
  rows: ConsolidatedTrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  total_eliminations: number;
  is_balanced: boolean;
}

export interface ConsolidatedIncomeStatement {
  as_of_date: string;
  companies: Array<{ id: number; name: string }>;
  revenue: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    eliminated: number;
    consolidated: number;
  };
  expense: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    eliminated: number;
    consolidated: number;
  };
  net_income: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    consolidated: number;
  };
  eliminations: IntercompanyEliminationDetail[];
}

export interface ConsolidatedBalanceSheet {
  as_of_date: string;
  companies: Array<{ id: number; name: string }>;
  assets: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    eliminated: number;
    consolidated: number;
    items: Array<{ code: string; name: string; balances: Record<number, number>; consolidated: number }>;
  };
  liabilities: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    eliminated: number;
    consolidated: number;
    items: Array<{ code: string; name: string; balances: Record<number, number>; consolidated: number }>;
  };
  equity: {
    standalone: Record<number, number>;
    unadjusted_total: number;
    consolidated: number;
    items: Array<{ code: string; name: string; balances: Record<number, number>; consolidated: number }>;
  };
  total_assets: number;
  total_liabilities_and_equity: number;
  is_balanced: boolean;
  eliminations: IntercompanyEliminationDetail[];
}

// ─── Phase 16: Notifications & Attachments ────────────────────────────────────

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error' | null;
  reference_type?: string | null;
  reference_id?: number | null;
  read_at?: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  company_id: number;
  reference_type: string;
  reference_id: number;
  category?: string | null;
  notes?: string | null;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  file_size?: number | null;
  uploaded_by?: number | null;
  created_at: string;
}




