# ERP Manajemen — Database Architecture & Administration Guide

This document describes the MySQL / MariaDB database architecture for **ERP Manajemen**, including table relationships, connection pool tuning, multi-company indexing, migration protocols, and zero-downtime schema evolution rules.

---

## 1. Database Specifications & Configuration

- **Database Name**: `erp_manajemen`
- **Engine**: `InnoDB` (ACID compliant, row-level locking, foreign key constraints)
- **Character Set**: `utf8mb4`
- **Collation**: `utf8mb4_unicode_ci`
- **Monetary Precision**: `DECIMAL(18, 2)` (Strict double-entry precision — floating point numbers are strictly forbidden)
- **Physical Quantity Precision**: `DECIMAL(18, 4)` (Permits fractional units e.g., KG, Meter, Liter)
- **Timestamp Standard**: `DATETIME` / `TIMESTAMP` stored in UTC.

### MariaDB / MySQL Server Optimization (`my.cnf`)
```ini
[mysqld]
# Storage & Buffers
default_storage_engine          = InnoDB
innodb_buffer_pool_size         = 4G          # 50-70% of total server RAM
innodb_log_file_size            = 512M
innodb_flush_log_at_trx_commit  = 1           # Strict ACID compliance
innodb_file_per_table           = 1

# Connections & Timeouts
max_connections                 = 200
wait_timeout                    = 300
interactive_timeout             = 300

# Charset
character-set-server            = utf8mb4
collation-server                = utf8mb4_unicode_ci

# Query Logging & Slow Queries
slow_query_log                  = 1
slow_query_log_file             = /var/log/mysql/slow.log
long_query_time                 = 1.0         # Log queries slower than 1 second
```

---

## 2. Multi-Company Isolation & Indexing Strategy

Every company-owned table enforces multi-tenant scoping via `company_id`.

### Composite Indexing Rules
To ensure fast sub-millisecond query execution and zero cross-company latency degradation, multi-column composite indices are structured with `company_id` as the leading column:

```sql
-- Inventory Balances & Lookups
INDEX idx_stock_co_wh_prod (company_id, warehouse_id, product_id)
INDEX idx_inv_tx_co_prod (company_id, product_id, transaction_date)

-- Financial & Subledger Queries
INDEX idx_payables_co_status (company_id, status, due_date)
INDEX idx_receivables_co_status (company_id, status, due_date)
INDEX idx_gl_co_date_acct (company_id, posting_date, account_id)
INDEX idx_journal_co_date (company_id, journal_date, status)
```

---

## 3. Core Database Tables & Domain Grouping

| Domain | Primary Tables | Responsibility & Invariants |
| :--- | :--- | :--- |
| **Administration** | `companies`, `users`, `roles`, `branches`, `audit_logs`, `system_settings`, `notifications`, `attachments` | Multi-company registration, RBAC matrix, immutable security audit trail. |
| **Master Data** | `products`, `product_categories`, `warehouses`, `customers`, `suppliers`, `employees` | Catalog of goods, partners, and physical locations scoped per company. |
| **Inventory** | `stock_balances`, `inventory_transactions`, `inventory_transfers`, `inventory_adjustments` | Non-negative inventory balance, movement ledger, inter-warehouse transfer `in_transit`. |
| **Purchasing** | `purchase_requests`, `purchase_orders`, `purchase_items`, `goods_receipts`, `payables` | Procure-to-Pay workflow, supplier invoices, AP subledger tracking. |
| **Sales** | `sales_orders`, `sales_items`, `deliveries`, `invoices`, `receivables` | Order-to-Cash workflow, customer delivery fulfillment, AR subledger tracking. |
| **Cash & Expenses** | `cash_accounts`, `bank_accounts`, `cash_transactions`, `bank_transactions`, `expenses`, `expense_approvals` | Physical cash registers, bank reconciliations, multi-tiered expense authorizations. |
| **AR/AP Payments**| `payments`, `payment_allocations` | Bill/invoice settlements, allocation bounds ($\text{Allocated} \le \text{Outstanding}$). |
| **Accounting** | `accounts`, `financial_periods`, `journal_entries`, `journal_entry_items`, `general_ledger` | Double-entry journal engine ($\sum \text{Dr} = \sum \text{Cr}$), immutable posted ledger. |
| **Fixed Assets** | `asset_categories`, `fixed_assets`, `asset_depreciations` | Asset register, straight-line depreciation engine, asset disposal ledger. |
| **Intercompany** | `intercompany_transactions` | Bilateral dual-sided atomic transactions ($\text{IC-AR} \equiv \text{IC-AP}$) and settlements. |

---

## 4. Migration & Schema Change Protocol

1. **Check Existing Dependencies**:
   - Inspect existing constraints, views, and related tables before creating migrations.
2. **Never Drop Production Columns Casually**:
   - Deprecate columns gracefully across releases rather than executing destructive `DROP COLUMN` statements immediately.
3. **Safe DDL Execution**:
   - Use `ALGORITHM=INPLACE, LOCK=NONE` on large tables (e.g. `general_ledger`, `inventory_transactions`) to prevent table locking.
4. **Atomic Migrations**:
   - Wrap migration scripts in transaction blocks where DDL supports it or write idempotent scripts with checks (`IF NOT EXISTS`).

### Example Migration Template
```sql
-- Migration: 20260820_add_approval_threshold.sql
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS description VARCHAR(255) NULL AFTER setting_value;
```
