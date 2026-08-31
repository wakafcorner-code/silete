# AGENT_TASKS.md

# ERP Management System — Antigravity Development Plan

**Project:** ERP Management System  
**Database:** MySQL / MariaDB  
**Development Database:** XAMPP  
**Database Name:** `erp_manajemen`  
**Frontend/Backend:** Next.js + TypeScript + App Router  
**ORM / DB Access:** Follow the project decision already established; do not switch database engine.  
**Architecture:** UI → Service Layer → Database Transaction → MySQL

---

## 0. GLOBAL EXECUTION RULES

Antigravity MUST follow these rules for every phase.

### 0.1 Sequential execution

- Execute only one phase at a time.
- Do not begin the next phase until the current phase passes its acceptance tests.
- If a test fails, stop and fix the current phase.
- Do not hide failing tests or mark a phase complete manually.
- Do not perform large unrelated refactors while working on a phase.

### 0.2 Source-of-truth documents

Before coding, read:

1. `AGENTS.md`
2. `PRD.md`
3. `DATABASE_SCHEMA.md`
4. `ACCOUNTING_RULES.md`
5. This file: `AGENT_TASKS.md`

If an implementation conflicts with those documents:

- STOP.
- Identify the conflict.
- Do not silently override the documented rule.

### 0.3 Database rules

- Database engine remains MySQL / MariaDB.
- Database name remains `erp_manajemen`.
- Development environment is XAMPP.
- Never create a second database for the same application.
- Never switch the project to PostgreSQL.
- Never destroy existing production-like data during development.
- Use migrations or controlled SQL changes.
- All multi-step financial operations must use database transactions.

### 0.4 Security rules

- Never trust `company_id` coming directly from the browser.
- Verify company access server-side.
- Never expose unauthorized company data.
- Never bypass permission checks.
- Sensitive mutations must create audit logs.
- Never put secrets in source code.
- Never commit `.env` files containing real credentials.

### 0.5 Accounting rules

- Posted financial transactions use double-entry accounting.
- Total debit must equal total credit.
- Posted transactions cannot be hard deleted.
- Use reversal / adjustment entries.
- Closed periods cannot be modified.
- Intercompany transactions must record both sides.
- Consolidated reporting must eliminate intercompany balances where applicable.

### 0.6 Inventory rules

- Every stock movement creates an inventory transaction.
- Never update stock silently without a corresponding movement.
- Negative stock must be prevented unless explicitly configured.
- Stock balances are derived/maintained from controlled inventory movements.

### 0.7 Code architecture

- React components are not the place for accounting/business rules.
- Use server-side service functions.
- Validate input with Zod.
- Use strict TypeScript.
- Avoid `any`.
- Keep database access isolated.
- Keep business logic testable independently from UI.

---

# PHASE 01 — PROJECT FOUNDATION

## Objective

Create a clean Next.js project foundation that can support the ERP architecture without implementing business modules yet.

## Scope

Create/configure:

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui foundation
- ESLint
- formatting conventions
- environment configuration
- base application layout
- error/loading/not-found handling
- base `src` structure
- database connection foundation

## Files/folders allowed

```text
app/
src/
  app/
  components/
  lib/
  services/
  types/
  config/
public/
.env.example
package.json
tsconfig.json
next.config.*
eslint.config.*
```

Do not create ERP business tables or modules in this phase.

## Acceptance tests

- [ ] `npm install` succeeds.
- [ ] Development server starts.
- [ ] Production build succeeds.
- [ ] TypeScript check succeeds.
- [ ] ESLint succeeds.
- [ ] `/` loads.
- [ ] `/login` route can exist as a placeholder.
- [ ] `.env.example` documents MySQL connection variables.
- [ ] No secret is hardcoded.

## STOP condition

STOP after foundation tests pass.

Do not implement authentication, inventory, finance, or accounting yet.

---

# PHASE 02 — DATABASE CONNECTION + SCHEMA BASELINE

## Objective

Connect Next.js to XAMPP MySQL database `erp_manajemen` and establish the schema as the application baseline.

## Scope

- MySQL connection
- connection pooling
- database health check
- schema documentation
- controlled schema/migration mechanism
- import/verification of `erp_manajemen.sql`
- basic database utility functions

## Required environment

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=erp_manajemen
```

Actual credentials must come from environment variables.

## Acceptance tests

- [ ] XAMPP MySQL is reachable.
- [ ] Application can connect to `erp_manajemen`.
- [ ] Database health check returns success.
- [ ] All required baseline tables exist.
- [ ] Foreign keys are valid.
- [ ] No application code creates another database.
- [ ] Application can perform a safe read query.

## STOP condition

If database connection fails, STOP.

Do not continue to authentication until database connectivity is stable.

---

# PHASE 03 — AUTHENTICATION + RBAC

## Objective

Implement secure authentication and role-based access control.

## Scope

- login
- logout
- session
- password hashing
- users
- roles
- permissions
- role assignment
- route protection
- server-side authorization

## Initial roles

```text
SUPER_ADMIN
ADMIN
FINANCE
WAREHOUSE
PURCHASING
SALES
VIEWER
```

## Required security behavior

- Authentication must be server-side.
- Authorization must be checked server-side.
- UI hiding is not authorization.
- A user without permission must receive an authorization failure.

## Acceptance tests

- [ ] Valid login succeeds.
- [ ] Invalid password fails.
- [ ] Logout invalidates session.
- [ ] Protected routes reject unauthenticated users.
- [ ] VIEWER cannot mutate protected data.
- [ ] FINANCE can access finance/accounting permissions only as configured.
- [ ] SUPER_ADMIN can administer the system.
- [ ] Permission checks work independently of UI visibility.

## STOP condition

Do not proceed if unauthorized users can access protected server actions/API endpoints.

---

# PHASE 04 — MULTI-COMPANY FOUNDATION

## Objective

Implement Company A / Company B isolation.

## Scope

- company context
- company selection
- server-side company access
- branch context
- warehouse context
- company-aware queries
- company-aware service layer

## Core rule

Every company-owned business transaction must be scoped by `company_id`.

Never rely solely on:

```text
company_id from browser
```

The server must derive/verify the permitted company context.

## Acceptance tests

- [ ] Company A data is visible to authorized Company A users.
- [ ] Company B data is visible to authorized Company B users.
- [ ] A user cannot query another company by changing an ID in the request.
- [ ] Branches are company-scoped.
- [ ] Warehouses are company-scoped.
- [ ] Products/customers/suppliers are company-scoped.
- [ ] Database queries include appropriate company isolation.
- [ ] SUPER_ADMIN can intentionally access both companies.

## STOP condition

Any cross-company data leak is a BLOCKER.

---

# PHASE 05 — MASTER DATA

## Objective

Implement reusable master data management.

## Scope

- customers
- suppliers
- employees
- product categories
- products
- branches
- warehouses

## Required behavior

- CRUD with validation
- active/inactive status
- company scoping
- search
- pagination
- duplicate prevention
- audit logging for important mutations

## Acceptance tests

- [ ] Create master record.
- [ ] Edit master record.
- [ ] Deactivate master record.
- [ ] Duplicate company code/SKU is rejected.
- [ ] Invalid input is rejected by Zod/server validation.
- [ ] Company A cannot modify Company B master data.
- [ ] Important mutations create audit records.

## STOP condition

Do not start inventory until master data is stable.

---

# PHASE 06 — WAREHOUSE + INVENTORY

## Objective

Implement controlled stock management.

## Scope

- stock balances
- inventory transactions
- receiving
- issuing
- transfer
- stock adjustment
- stock opname
- stock movement history

## Core rule

Never change stock directly from a UI component.

Stock-changing operations must go through an inventory service.

## Required transaction pattern

```text
Business operation
    ↓
Validate
    ↓
Check company access
    ↓
Check stock rules
    ↓
Database transaction
    ↓
Create inventory transaction
    ↓
Update stock balance
    ↓
Audit log
```

## Acceptance tests

### Receipt

- [ ] Receiving increases stock.
- [ ] Inventory transaction is created.

### Issue

- [ ] Issuing decreases stock.
- [ ] Insufficient stock is rejected unless explicitly configured.

### Transfer

- [ ] Source warehouse decreases.
- [ ] Destination warehouse increases.
- [ ] Both movements are recorded atomically.

### Adjustment

- [ ] Adjustment requires reason.
- [ ] Adjustment creates movement.

### Opname

- [ ] Opname can compare system quantity against physical quantity.
- [ ] Approved difference creates controlled adjustment.

## STOP condition

No direct stock mutation may exist outside the controlled inventory service.

---

# PHASE 07 — PURCHASING

## Objective

Implement the purchasing workflow.

## Workflow

```text
Purchase Request
    ↓
Approval
    ↓
Purchase Order
    ↓
Goods Receipt
    ↓
Supplier Invoice
    ↓
AP
    ↓
Payment
    ↓
Journal
```

## Scope

- purchase requests
- approval
- purchase orders
- purchase items
- goods receipts
- receipt items
- supplier invoices

## Acceptance tests

- [ ] Purchase request can be created.
- [ ] Approval workflow works.
- [ ] PO can be generated.
- [ ] PO quantities are validated.
- [ ] Goods receipt references PO.
- [ ] Receipt updates inventory.
- [ ] Supplier invoice creates AP when posted.
- [ ] Cancelled/posted state rules are enforced.
- [ ] Duplicate document numbers are rejected.

## STOP condition

Do not implement supplier payment integration until purchasing and AP creation are stable.

---

# PHASE 08 — SALES

## Objective

Implement sales order to delivery/invoice workflow.

## Workflow

```text
Sales Order
    ↓
Confirmation
    ↓
Delivery
    ↓
Invoice
    ↓
AR
    ↓
Customer Payment
    ↓
Journal
```

## Scope

- sales orders
- sales items
- delivery
- delivery items
- customer invoices

## Acceptance tests

- [ ] Sales order created.
- [ ] Customer is company-scoped.
- [ ] Product is company-scoped.
- [ ] Delivery reduces stock.
- [ ] Delivery cannot exceed permitted quantity.
- [ ] Sales invoice can be posted.
- [ ] AR is created from posted credit sales.
- [ ] Status transitions are controlled.

## STOP condition

No accounting posting is considered complete until Phase 11 accounting engine is available. Before that, sales may create accounting-ready source transactions but must not duplicate accounting logic in UI.

---

# PHASE 09 — CASH + BANK + EXPENSE

## Objective

Implement operational finance transactions.

## Scope

- cash accounts
- cash transactions
- bank accounts
- bank transactions
- expense categories
- expenses
- expense approval

## Workflow expense

```text
Expense Request
    ↓
Approval
    ↓
Payment
    ↓
Cash/Bank
    ↓
Accounting posting
```

## Acceptance tests

- [ ] Cash account can be configured.
- [ ] Bank account can be configured.
- [ ] Cash receipt recorded.
- [ ] Cash payment recorded.
- [ ] Bank transaction recorded.
- [ ] Expense approval works.
- [ ] Unapproved expense cannot be paid when approval is required.
- [ ] Company isolation works.
- [ ] Financial mutations create audit logs.

## STOP condition

Do not allow a posted finance transaction to be hard deleted.

---

# PHASE 10 — AR / AP + PAYMENTS

## Objective

Implement receivables, payables, and payment allocation.

## Scope

- receivables
- payables
- payments
- payment allocations
- aging
- outstanding balances

## Required behavior

```text
Invoice
  ↓
AR/AP
  ↓
Payment
  ↓
Allocation
  ↓
Remaining balance
```

## Acceptance tests

### AR

- [ ] Customer invoice creates AR.
- [ ] Payment can be allocated to AR.
- [ ] Partial payment works.
- [ ] Full payment changes status to paid.
- [ ] Balance cannot become negative.

### AP

- [ ] Supplier invoice creates AP.
- [ ] Supplier payment can be allocated.
- [ ] Partial payment works.
- [ ] Full payment changes status to paid.

### Aging

- [ ] Current balance is correct.
- [ ] Overdue balance is correctly identified.
- [ ] Company filtering works.

## STOP condition

AR/AP totals must reconcile to their underlying invoices and allocations.

---

# PHASE 11 — ACCOUNTING ENGINE

## Objective

Implement the central double-entry accounting engine.

This is the most critical financial phase.

## Scope

- chart of accounts
- financial periods
- journal entries
- journal entry items
- posting
- reversal
- general ledger
- trial balance

## Core invariant

For every posted journal:

```text
SUM(debit) = SUM(credit)
```

## Required architecture

```text
Source Transaction
       ↓
Accounting Service
       ↓
Build Journal
       ↓
Validate Journal
       ↓
Database Transaction
       ↓
Post Journal
       ↓
General Ledger
       ↓
Audit Log
```

## Required test cases

### TEST-ACC-001 — Sales

```text
Debit  Accounts Receivable
Credit Revenue
```

Debit must equal credit.

### TEST-ACC-002 — Customer payment

```text
Debit  Bank/Cash
Credit Accounts Receivable
```

### TEST-ACC-003 — Purchase on credit

```text
Debit  Inventory / Expense
Credit Accounts Payable
```

### TEST-ACC-004 — Supplier payment

```text
Debit  Accounts Payable
Credit Bank/Cash
```

### TEST-ACC-005 — Expense payment

```text
Debit  Expense
Credit Bank/Cash
```

### TEST-ACC-006 — Asset purchase

```text
Debit  Fixed Asset
Credit Bank/AP
```

## Acceptance tests

- [ ] Unbalanced journal cannot be posted.
- [ ] Zero-value journal is rejected where inappropriate.
- [ ] Posted journal cannot be edited.
- [ ] Posted journal cannot be hard deleted.
- [ ] Reversal creates a new controlled entry.
- [ ] Closed period rejects posting.
- [ ] Trial balance balances.
- [ ] General ledger reflects posted journals.
- [ ] Every source posting has traceability to its journal.

## STOP condition

This phase is BLOCKED until all accounting invariants pass.

Do not move to assets/intercompany with a broken accounting engine.

---

# PHASE 12 — FIXED ASSETS

## Objective

Implement asset management and depreciation.

## Scope

- asset categories
- asset register
- acquisition
- depreciation
- disposal
- accumulated depreciation

## Initial depreciation method

```text
Straight Line
```

unless future requirements explicitly add another method.

## Acceptance tests

- [ ] Asset can be registered.
- [ ] Acquisition cost is stored correctly.
- [ ] Useful life is respected.
- [ ] Monthly depreciation calculation is correct.
- [ ] Accumulated depreciation updates correctly.
- [ ] Depreciation generates accounting-ready/posting entries through the accounting service.
- [ ] Disposed assets stop normal depreciation.

## STOP condition

Do not put depreciation journal logic inside React pages or route handlers.

---

# PHASE 13 — INTERCOMPANY

## Objective

Implement transactions between Company A and Company B.

## Core fields

```text
source_company_id
destination_company_id
```

## Workflow

```text
Company A
    ↓
Intercompany Transaction
    ↓
Company B
    ↓
Reconciliation
    ↓
Settlement
    ↓
Consolidation
```

## Example

Company A sells to Company B:

### Company A

```text
Debit  Intercompany Receivable
Credit Revenue
```

### Company B

```text
Debit  Inventory / Expense
Credit Intercompany Payable
```

## Acceptance tests

- [ ] Source company is valid.
- [ ] Destination company is valid.
- [ ] Source and destination cannot accidentally be the same company when the transaction requires two companies.
- [ ] Both sides are created atomically.
- [ ] Both companies can reconcile the transaction.
- [ ] Settlement updates outstanding intercompany balance.
- [ ] Failed creation rolls back both sides.
- [ ] Intercompany data is isolated appropriately.

## STOP condition

If one company side can post without the other when both are required, STOP.

---

# PHASE 14 — CONSOLIDATION + ELIMINATION

## Objective

Create consolidated reporting for multiple companies.

## Scope

- consolidated trial balance
- consolidated income statement
- consolidated balance sheet
- intercompany elimination
- company comparison
- reconciliation

## Core rule

Consolidated reports must not simply sum both companies when intercompany balances/revenue must be eliminated.

## Acceptance tests

- [ ] Company A report works independently.
- [ ] Company B report works independently.
- [ ] Consolidated report combines companies.
- [ ] Intercompany balances are identified.
- [ ] Required intercompany revenue/expense/balance eliminations are applied.
- [ ] Consolidated totals reconcile to source company reports after elimination.

## STOP condition

Do not label a report "consolidated" if intercompany elimination is not implemented for the relevant accounts.

---

# PHASE 15 — REPORTING + DASHBOARD

## Objective

Build management reporting on top of validated transactional/accounting data.

## Scope

### Dashboard

- revenue
- expenses
- profit/loss
- cash
- bank
- AR
- AP
- inventory
- company comparison

### Accounting reports

- trial balance
- general ledger
- journal report
- income statement
- balance sheet

### Operational reports

- stock report
- stock movement
- purchasing
- sales
- AR aging
- AP aging
- expense report

## Acceptance tests

- [ ] Reports respect company permissions.
- [ ] Date filters work.
- [ ] Company filters work.
- [ ] Report totals reconcile to source data.
- [ ] Posted accounting data is used as the accounting source of truth.
- [ ] Unauthorized users cannot retrieve another company's report.

## STOP condition

No report should calculate financial truth differently from the accounting engine.

---

# PHASE 16 — AUDIT, ATTACHMENTS, NOTIFICATIONS + ADMIN

## Objective

Complete operational governance features.

## Scope

- audit log viewer
- attachments
- notifications
- system settings
- document numbering settings
- approval settings
- user administration
- role administration

## Acceptance tests

- [ ] Important create/update/post/cancel/reverse actions are auditable.
- [ ] Audit log identifies user and timestamp.
- [ ] Sensitive changes retain useful before/after information where appropriate.
- [ ] Attachments are linked to records.
- [ ] Notifications can be generated.
- [ ] Permission changes are auditable.
- [ ] Admin pages remain company/security aware.

## STOP condition

Do not expose raw audit logs or attachments to unauthorized users.

---

# PHASE 17 — FULL INTEGRATION TEST + SECURITY HARDENING

## Objective

Test the ERP as one integrated system.

## Test scenarios

### Scenario A — Purchase

```text
Purchase Request
→ Approval
→ PO
→ Goods Receipt
→ Inventory Increase
→ Supplier Invoice
→ AP
→ Supplier Payment
→ Journal
→ General Ledger
```

### Scenario B — Sales

```text
Sales Order
→ Delivery
→ Inventory Decrease
→ Customer Invoice
→ AR
→ Customer Payment
→ Journal
→ General Ledger
```

### Scenario C — Expense

```text
Expense
→ Approval
→ Payment
→ Cash/Bank
→ Journal
```

### Scenario D — Intercompany

```text
Company A
→ Intercompany Transaction
→ Company B
→ Both Journals
→ Reconciliation
→ Settlement
→ Consolidation Elimination
```

## Security tests

- [ ] Unauthenticated request rejected.
- [ ] Unauthorized role rejected.
- [ ] Company A cannot access Company B by changing IDs.
- [ ] Server-side authorization cannot be bypassed.
- [ ] SQL injection protections verified.
- [ ] Input validation verified.
- [ ] Sensitive errors do not expose secrets.
- [ ] Environment secrets are not exposed to client code.
- [ ] Posted transactions cannot be deleted.
- [ ] Closed periods cannot be modified.

## Data integrity tests

- [ ] Trial balance balances.
- [ ] AR reconciliation works.
- [ ] AP reconciliation works.
- [ ] Inventory reconciliation works.
- [ ] Cash reconciliation works.
- [ ] Bank reconciliation works.
- [ ] Intercompany reconciliation works.
- [ ] Consolidated report works.

## STOP condition

Any critical security or accounting integrity failure blocks release.

---

# PHASE 18 — PRODUCTION READINESS + HANDOVER

## Objective

Prepare the ERP for deployment and future development.

## Scope

- production environment configuration
- database backup strategy
- migration strategy
- logging
- monitoring
- error handling
- deployment documentation
- administrator documentation
- developer documentation
- seed strategy
- rollback procedure

## Required documentation

```text
README.md
DEPLOYMENT.md
DATABASE.md
BACKUP.md
SECURITY.md
TROUBLESHOOTING.md
```

## Acceptance tests

- [ ] Clean installation documented.
- [ ] Database setup documented.
- [ ] Environment variables documented without secrets.
- [ ] Backup procedure tested.
- [ ] Restore procedure tested.
- [ ] Production build succeeds.
- [ ] Application starts from a clean environment.
- [ ] Migration process documented.
- [ ] Rollback process documented.
- [ ] Admin can create/manage users.
- [ ] Final security checklist passes.

## FINAL STOP / RELEASE GATE

Antigravity must NOT declare the ERP production-ready unless:

- [ ] All Phase 1–17 acceptance tests pass.
- [ ] No known critical security vulnerability remains.
- [ ] Accounting balance tests pass.
- [ ] Multi-company isolation tests pass.
- [ ] Inventory integrity tests pass.
- [ ] AR/AP reconciliation passes.
- [ ] Intercompany reconciliation passes.
- [ ] Consolidation/elimination tests pass.
- [ ] Backup and restore have been tested.
- [ ] Production build succeeds.

---

# ANTIGRAVITY PHASE EXECUTION PROTOCOL

At the beginning of every phase, output:

```text
PHASE: XX
OBJECTIVE: ...
SCOPE: ...
FILES TO CHANGE: ...
FILES NOT TO CHANGE: ...
DEPENDENCIES: ...
```

Before coding:

```text
PRE-CHECK
- Read AGENTS.md
- Read PRD.md
- Read DATABASE_SCHEMA.md
- Read ACCOUNTING_RULES.md
- Read current phase specification
```

After coding:

```text
IMPLEMENTATION SUMMARY
- Files created:
- Files modified:
- Database changes:
- Business rules implemented:
```

Then run:

```text
VALIDATION
- TypeScript:
- Lint:
- Build:
- Unit tests:
- Integration tests:
- Database tests:
- Security tests:
```

Then report:

```text
PHASE RESULT
PASS / FAIL / BLOCKED

FAILED TESTS:
...

KNOWN ISSUES:
...

NEXT PHASE:
...
```

## Critical instruction

If the phase result is:

```text
FAIL
```

or

```text
BLOCKED
```

Antigravity MUST NOT start the next phase.

It must remain on the current phase until the failure is resolved or explicitly escalated to the project owner.

---

# FILE OWNERSHIP RULE

Antigravity must treat these files as architectural contracts:

```text
AGENTS.md
PRD.md
DATABASE_SCHEMA.md
ACCOUNTING_RULES.md
AGENT_TASKS.md
```

Do not rewrite these files automatically merely to make a test pass.

If an architectural change is genuinely required:

1. Explain the reason.
2. Identify affected rules.
3. Propose the change.
4. Wait for project-owner approval if the change affects accounting, security, database architecture, multi-company behavior, or intercompany logic.

---

# FINAL DEVELOPMENT ORDER

```text
01 Foundation
      ↓
02 Database
      ↓
03 Authentication + RBAC
      ↓
04 Multi Company
      ↓
05 Master Data
      ↓
06 Inventory
      ↓
07 Purchasing
      ↓
08 Sales
      ↓
09 Cash + Bank + Expense
      ↓
10 AR + AP
      ↓
11 Accounting Engine
      ↓
12 Fixed Assets
      ↓
13 Intercompany
      ↓
14 Consolidation
      ↓
15 Reporting
      ↓
16 Audit + Admin
      ↓
17 Integration + Security
      ↓
18 Production Readiness
```

# PROJECT COMPLETION CRITERIA

The ERP is considered complete only when:

1. All 18 phases pass.
2. Multi-company data is isolated.
3. Inventory movements are controlled.
4. Financial transactions are double-entry.
5. Debit equals credit for every posted journal.
6. Posted transactions cannot be hard deleted.
7. Closed periods are protected.
8. AR/AP reconcile.
9. Intercompany transactions reconcile.
10. Consolidated reports eliminate applicable intercompany balances.
11. Audit trails exist for sensitive operations.
12. Security tests pass.
13. Backup and restore procedures are tested.
14. Production build succeeds.
