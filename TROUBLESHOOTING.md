# ERP Manajemen — Troubleshooting & Incident Resolution Runbook

This runbook provides diagnostic checklists, log analysis procedures, and resolution Standard Operating Procedures (SOPs) for common operational incidents in **ERP Manajemen**.

---

## 1. Diagnostic Checklist & Quick Health Inspection

When investigating an issue, execute these health checks in order:

```bash
# 1. Check application process status
pm2 status erp-manajemen

# 2. Check live process logs
pm2 logs erp-manajemen --lines 50

# 3. Check database connectivity
npm run test:db

# 4. Verify system-wide accounting balance
npm run test:accounting-engine

# 5. Check full regression test suite
npm run test:all
```

---

## 2. Common Incidents & Resolution SOPs

### 2.1 Database Connection Timeout (`ECONNREFUSED` / `PROTOCOL_CONNECTION_LOST`)
- **Symptoms**: HTTP 500 error on API calls; PM2 logs report connection lost to MariaDB / MySQL.
- **Root Causes**: MySQL service stopped, connection limit saturated, or firewall blocking port 3306/3307.
- **Resolution**:
  1. Check MySQL service status: `sudo systemctl status mysql` or XAMPP Control Panel.
  2. Increase connection pool limit in `.env.local` / `.env.production`: `DB_CONNECTION_LIMIT=30`.
  3. Verify database credentials and port in environment variables.

---

### 2.2 Unbalanced Journal Posting Error (`UNBALANCED_JOURNAL_REJECTED`)
- **Symptoms**: Journal posting fails with error: `"Journal is unbalanced: Debit !== Credit"`.
- **Root Causes**: Rounding discrepancy in client submission or missing tax/discount line item.
- **Invariant**: The system will **never** post an unbalanced journal.
- **Resolution**:
  1. Inspect the journal items payload.
  2. Verify that $\sum \text{Debit} \equiv \sum \text{Credit}$ down to 2 decimal places.
  3. Ensure contra-accounts (e.g. `1500 Akumulasi Penyusutan`) use normal credit balance rather than negative debit.

---

### 2.3 Closed Financial Period Rejection (`PERIOD_CLOSED_POSTING_BLOCKED`)
- **Symptoms**: Attempting to post a transaction returns: `"Financial period for target date is closed"`.
- **Root Causes**: The accounting period for the transaction date has been finalized and closed by Finance Manager.
- **Resolution**:
  1. Ordinary edits to closed periods are prohibited by accounting rules.
  2. If an audit adjustment is required, the authorized Finance Manager must either post a corrective adjustment in the current **open** period, or temporarily reopen the period via `/api/accounting/financial-periods/:id/reopen`.

---

### 2.4 Intercompany Reconciliation Mismatch (`IC_RECONCILIATION_FAILED`)
- **Symptoms**: Consolidated report highlights intercompany receivable (1250) != intercompany payable (2200).
- **Root Causes**: Manual one-sided journal entered directly instead of using the bilateral intercompany engine (`/api/intercompany/transactions`).
- **Resolution**:
  1. Query both sides:
     ```sql
     SELECT COALESCE(SUM(debit - credit), 0) FROM general_ledger WHERE account_id = 32; -- Co 1 IC-AR
     SELECT COALESCE(SUM(credit - debit), 0) FROM general_ledger WHERE account_id = 16; -- Co 2 IC-AP
     ```
  2. Identify the unposted or orphan transaction.
  3. Post compensating journal entry to re-align reciprocal balances.

---

### 2.5 Negative Stock Balance Rejection (`INSUFFICIENT_STOCK_BALANCE`)
- **Symptoms**: Delivery Order or Inventory Transfer rejected with: `"Insufficient stock available in warehouse"`.
- **Root Causes**: Physical goods receipt has not yet been posted in the system before delivery issuance.
- **Resolution**:
  1. Confirm that the corresponding Goods Receipt (GRN) has been posted for the Purchase Order.
  2. Verify physical stock count via `/api/inventory/stock-balances`.
  3. If discrepancy is due to physical inventory loss or gain, record an authorized **Stock Adjustment** via `/dashboard/inventory/adjustments`.

---

### 2.6 Next.js Build or Compilation Errors
- **Symptoms**: `npm run build` fails during static analysis or type checking.
- **Resolution**:
  1. Run TypeScript check: `npm run typecheck` to locate exact file and line number.
  2. Clear build cache: `rm -rf .next` and re-run `npm run build`.
