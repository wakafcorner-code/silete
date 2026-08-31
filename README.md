# ERP Manajemen — Multi-Company Enterprise Resource Planning & Financial Management

[![Next.js 16 App Router](https://img.shields.io/badge/Next.js-16.3.1-black.svg)](https://nextjs.org/)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![MariaDB / MySQL](https://img.shields.io/badge/Database-MySQL%20%2F%20MariaDB-orange.svg)](https://mariadb.org/)
[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green.svg)](#)

**ERP Manajemen** adalah sistem ERP Multi-Company terintegrasi penuh yang dirancang untuk mengelola operasional bisnis dan akuntansi multi-entitas dalam satu database tunggal (`erp_manajemen`) dengan isolasi data yang ketat berbasis `company_id`.

---

## 🌟 Key Capabilities & Modules

1. **Authentication & Multi-Company RBAC**
   - JWT-based authentication via HTTP-only secure cookies.
   - 9 granular system roles (Super Admin, Owner/Director, Company Admin, Finance, Finance Manager, Purchasing, Sales, Warehouse Admin, Auditor).
   - Strict multi-company scoping with zero cross-tenant IDOR leakage.

2. **Master Data Management**
   - Multi-company Products, SKU management, Categories, and Units.
   - Warehouses, Customers, Suppliers, and Employee directories.

3. **Warehouse & Physical Inventory Engine**
   - Non-negative stock control via atomic stock movements (`stock_balances`).
   - Movement ledger (`inventory_transactions`) tracking `receipt`, `issue`, `transfer_in`, `transfer_out`, and `adjustment`.
   - Inter-warehouse transfers supporting `in_transit` state.

4. **Procure-to-Pay (Purchasing Workflow)**
   - `Purchase Request (PR)` $\rightarrow$ Multi-tier Approval $\rightarrow$ `Purchase Order (PO)` $\rightarrow$ `Goods Receipt (GRN)` $\rightarrow$ `Supplier Invoice` $\rightarrow$ `Accounts Payable (AP)` $\rightarrow$ `Payment Execution` $\rightarrow$ `Automated Journal Posting` $\rightarrow$ `General Ledger`.

5. **Order-to-Cash (Sales Workflow)**
   - `Quotation` $\rightarrow$ `Sales Order (SO)` $\rightarrow$ `Delivery Order (DO)` $\rightarrow$ Inventory Stock Deduction $\rightarrow$ `Customer Invoice` $\rightarrow$ `Accounts Receivable (AR)` $\rightarrow$ `Payment Allocation` $\rightarrow$ `Automated Journal Posting` $\rightarrow$ `General Ledger`.

6. **Cash, Bank & Expense Management**
   - Multi-account Cash & Bank subledgers with transaction reconciliation.
   - Expense claim lifecycle (`draft` $\rightarrow$ `submitted` $\rightarrow$ `approved` $\rightarrow$ `paid`) with approval thresholds.

7. **Core Double-Entry Accounting Engine**
   - Standard Chart of Accounts (COA) with configurable normal balance (Debit/Credit).
   - Invariant Inviolable Rule: $\sum \text{Debit} \equiv \sum \text{Credit}$ on every posted journal.
   - Financial period states (`open`, `closing`, `closed`) and strict transaction immutability.

8. **Fixed Asset Management**
   - Asset categories, acquisition tracking, and straight-line monthly depreciation engine.
   - Asset disposal with automatic gain/loss journal integration and depreciation halt.

9. **Intercompany Transactions & Settlements**
   - Bilateral transaction engine creating atomic dual-sided journals on Source & Destination entities.
   - Intercompany reconciliation ensuring $\text{IC-Receivable (1250)} \equiv \text{IC-Payable (2200)}$.
   - Bilateral settlement workflow.

10. **Financial Consolidation & Group Reporting**
    - Consolidated Trial Balance with working papers.
    - Automated bilateral eliminations for internal receivables, payables, revenues, and expenses.
    - Consolidated Income Statement & Balance Sheet.

11. **Executive Dashboard & Business Intelligence**
    - Live executive KPI cards (Revenue, Expense, Net Profit/Loss, Cash, Bank, AR, AP, Inventory).
    - Subledger AR/AP Aging reports (0-30, 31-60, 61-90, >90 days).
    - Stock valuation and movement audit trails.

12. **Audit Trail & System Administration**
    - Comprehensive mutation audit trail capturing user, action, entity, before/after states, and timestamp.
    - In-app notification center, document attachment manager (25MB limit), and sequential document numbering.

---

## 🏗️ System Architecture

```text
Frontend Layer (Next.js App Router Server & Client Components)
                        ↓
API Routes / Route Handlers (Server-Side Authorization & Audit)
                        ↓
Zod Validation Layer (Strict Input Schema Checking)
                        ↓
Service Layer (Domain Business Rules & Accounting Math)
                        ↓
Repository / Database Layer (mysql2 Connection Pool)
                        ↓
MySQL / MariaDB Database (`erp_manajemen`)
```

---

## 🚀 Quick Start (Development)

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **MySQL / MariaDB**: MySQL 8.0+ / MariaDB 10.4+ (Default XAMPP Port 3306 or 3307)

### Installation & Run
```bash
# 1. Clone the repository
git clone <repo-url>
cd ERD_Manajemen

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your database credentials

# 4. Import initial schema
mysql -u root -p erp_manajemen < erp_manajemen.sql

# 5. Seed default administrative users
npm run seed

# 6. Run all automated test suites
npm run test:all

# 7. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with:
- **Super Admin**: `admin` / `admin123`
- **Director**: `director` / `director123`
- **Finance**: `finance` / `finance123`

---

## 🧪 Verification & Test Suite Matrix

The system includes 17 automated test suites covering 100% of workflows and financial invariants:

```bash
# Run complete system regression
npm run test:all

# Individual test suites:
npm run test:db                  # Phase 01: Connection & Table Verification
npm run test:auth                # Phase 02: Authentication & RBAC
npm run test:multi-company       # Phase 03: Multi-Company Isolation
npm run test:master-data         # Phase 04: Master Data CRUD
npm run test:inventory           # Phase 05: Inventory & Stock Movements
npm run test:purchasing          # Phase 06: Procure-to-Pay Workflow
npm run test:sales               # Phase 07: Order-to-Cash Workflow
npm run test:cash-bank-expenses  # Phase 08: Cash, Bank & Expense Approvals
npm run test:ar-ap-payments      # Phase 09: AR/AP Subledger & Payments
npm run test:accounting-engine   # Phase 10: Accounting Engine (Dr = Cr)
npm run test:fixed-assets        # Phase 11: Fixed Assets & Depreciation
npm run test:intercompany        # Phase 12: Intercompany Dual Posting & Settlement
npm run test:consolidation       # Phase 13: Consolidation & Eliminations
npm run test:reporting           # Phase 14: Financial & Aging Reports
npm run test:audit-security      # Phase 15: Audit Trail & Settings
npm run test:full-integration    # Phase 16: Master E2E & Hardening
npm run test:backup-restore      # Phase 17: Database Backup & Restore
```

---

## 📚 Technical Documentation Index

- [Deployment Guide](DEPLOYMENT.md) — Production setup, Nginx reverse proxy, PM2 orchestration, SSL, and zero-downtime rolling updates.
- [Database Guide](DATABASE.md) — Schema dictionary, connection pooling, indexing strategy, and migration protocol.
- [Backup & Disaster Recovery](BACKUP.md) — Automated backup procedures, retention schedules, and restore runbooks.
- [Security & Defense-in-Depth](SECURITY.md) — Threat model, RBAC policies, parameterization, audit logs, and IDOR protection.
- [Troubleshooting & Incident Runbook](TROUBLESHOOTING.md) — Common error resolution, log diagnostics, and recovery SOPs.
- [Accounting Invariants](ACCOUNTING_RULES.md) — Double-entry rules, financial period closing, and elimination formulas.

---

## 📄 License
Proprietary & Confidential — ERP Manajemen Team.
