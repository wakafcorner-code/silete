# AGENTS.md

# ERP Manajemen — AI Agent Development Rules

## 1. Project Identity

Project: ERP Manajemen
Architecture: Multi-company ERP + Financial Management System
Frontend/Backend: Next.js + TypeScript
Database: MySQL / MariaDB
Development environment: XAMPP
Database name: `erp_manajemen`

The system manages two or more companies in one database while keeping operational and financial data isolated by `company_id`.

Primary domains:

- Administration
- Multi-company management
- Warehouse and inventory
- Purchasing
- Sales
- Cash and bank
- Expenses
- Accounts receivable
- Accounts payable
- Fixed assets
- Accounting
- Intercompany transactions
- Consolidated reporting
- Audit trail

---

## 2. Non-Negotiable Rules

### 2.1 Database

- Use MySQL/MariaDB.
- Database name is exactly `erp_manajemen`.
- Do not switch to PostgreSQL.
- Do not introduce a second database for normal application data.
- Never hard-code database credentials.
- Read credentials from environment variables.
- Use `utf8mb4`.
- Monetary values must use `DECIMAL`, never floating-point types.
- Quantities must use an appropriate `DECIMAL` precision when fractional quantities are possible.
- Dates and timestamps must be stored in database-compatible date/time fields.

Recommended environment variables:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=erp_manajemen
```

---

## 3. Architecture Rules

Use a clear separation:

```text
UI / React Components
        ↓
Server Actions / Route Handlers
        ↓
Validation
        ↓
Service Layer
        ↓
Repository / Database Layer
        ↓
MySQL
```

Business rules must live in services/domain functions, not in React components.

Do not put accounting calculations directly inside UI components.

Do not duplicate business logic between Server Actions and API routes.

Prefer reusable service functions.

---

## 4. Next.js Rules

- Use Next.js App Router.
- Use TypeScript strict mode.
- Prefer Server Components by default.
- Use Client Components only where interactivity requires them.
- Keep secrets server-side.
- Never expose DB credentials to the browser.
- Never query MySQL directly from Client Components.
- Use server-side authorization for every protected mutation.
- Use Zod for server-side input validation.
- Use accessible semantic HTML and consistent UI components.
- Keep loading, empty, error, and success states explicit.

---

## 5. Multi-Company Rules

The application is multi-company.

Core principle:

```text
One database
    ↓
Many companies
    ↓
Company-scoped transactions
```

Every company-owned transaction must contain a valid `company_id`.

Typical company-owned records include:

- Warehouses
- Products where applicable
- Customers/suppliers where company-specific
- Purchases
- Sales
- Expenses
- Cash transactions
- Bank transactions
- Assets
- Journals
- Inventory movements

Never trust a `company_id` received from the browser.

The server must verify that the authenticated user has access to that company.

If a user is assigned to Company A only, requests attempting to access Company B must be rejected.

Never return mixed-company data unless the user explicitly has consolidated/reporting permission.

---

## 6. Roles and Permissions

Minimum roles:

- Super Admin
- Owner / Director
- Company Admin
- Warehouse Admin
- Finance
- Finance Manager
- Purchasing
- Sales
- Auditor

Authorization must be checked server-side.

Do not rely only on hidden buttons or disabled UI controls.

UI hiding is a usability feature, not a security boundary.

---

## 7. Inventory Rules

Never change stock without recording an inventory movement.

Every stock movement must identify:

- Company
- Warehouse
- Product
- Quantity
- Movement type
- Reference document
- User
- Timestamp

Examples:

- RECEIPT
- ISSUE
- TRANSFER_OUT
- TRANSFER_IN
- RETURN_IN
- RETURN_OUT
- ADJUSTMENT_IN
- ADJUSTMENT_OUT
- OPENING_BALANCE

Stock must be calculated from controlled movements or a transactionally maintained balance.

Do not allow negative stock unless the business configuration explicitly permits it.

Warehouse transfers must support `IN_TRANSIT` when physical receipt has not yet occurred.

---

## 8. Financial Rules

All posted financial transactions must use double-entry accounting.

Invariant:

```text
SUM(debit) = SUM(credit)
```

A journal entry that does not balance must never be posted.

Financial mutations that affect multiple tables must execute atomically inside a database transaction.

Examples:

- Payment + journal
- Invoice + receivable + journal
- Purchase receipt + inventory + payable/journal where applicable
- Expense payment + cash/bank + journal
- Intercompany transaction + both company journals

---

## 9. Posted Transactions

Posted financial records are immutable.

Do not hard-delete posted transactions.

Corrections must use:

- Reversal
- Adjustment
- Credit note/debit note where applicable
- Corrective journal

Draft records may be edited according to permissions.

---

## 10. Financial Period Rules

Financial periods have states:

```text
OPEN
CLOSING
CLOSED
```

A CLOSED period cannot receive ordinary edits or new postings.

Corrections must be posted through an authorized adjustment in an open period.

Period closing must verify:

- Balanced journals
- No invalid references
- No unresolved critical reconciliation differences
- Required approvals completed

---

## 11. Expense Workflow

Normal workflow:

```text
DRAFT
→ SUBMITTED
→ REVIEW
→ APPROVED
→ PAID
```

Alternative:

```text
SUBMITTED
→ REJECTED
```

An unapproved expense must not be paid unless an explicit emergency/override permission exists.

Approval thresholds must be configurable.

---

## 12. Purchasing Workflow

```text
Purchase Request
→ Approval
→ Purchase Order
→ Goods Receipt
→ Supplier Invoice
→ Accounts Payable
→ Payment
```

Partial receipt and partial payment must be supported.

---

## 13. Sales Workflow

```text
Quotation
→ Sales Order
→ Approval
→ Delivery
→ Invoice
→ Accounts Receivable
→ Payment
```

The system must support partial delivery and partial payment where required.

---

## 14. Accounts Receivable / Payable

Receivables and payables must have outstanding balances.

Payment allocation must not exceed outstanding balance.

Overpayment must be explicitly handled as:

- Advance
- Credit balance
- Refund

Do not silently create negative outstanding balances.

---

## 15. Fixed Asset Rules

Fixed assets are separate from inventory.

Asset records must support:

- Acquisition cost
- Acquisition date
- Useful life
- Residual value
- Depreciation method
- Accumulated depreciation
- Net book value
- Location
- Responsible person
- Company

Depreciation must generate controlled accounting entries.

---

## 16. Intercompany Rules

Intercompany transactions must contain:

```text
source_company_id
destination_company_id
```

A transaction between Company A and Company B must create balanced entries on both sides.

Example:

Company A sells to Company B:

```text
Company A:
Debit  Intercompany Receivable
Credit Intercompany Revenue / Revenue

Company B:
Debit  Inventory / Expense
Credit Intercompany Payable
```

The exact accounting depends on transaction type and configuration.

Intercompany receivable and payable must be reconcilable.

---

## 17. Consolidation Rules

Consolidated reporting:

```text
Company A
+
Company B
-
Intercompany Eliminations
=
Consolidated Group
```

Never simply sum company revenue and call it consolidated revenue.

Intercompany balances and internal revenue/expense must be eliminated according to the configured consolidation rules.

---

## 18. Audit Rules

Sensitive mutations must create audit records.

Audit fields should include:

- User
- Company
- Action
- Module
- Entity
- Entity ID
- Old values where applicable
- New values where applicable
- Timestamp
- IP where available
- User agent where appropriate

Audit records must not be editable by ordinary users.

---

## 19. Security Rules

- Validate every server input.
- Authorize every protected operation.
- Use parameterized queries/ORM-safe queries.
- Never concatenate untrusted SQL.
- Never expose secrets.
- Validate file uploads.
- Restrict attachment types and sizes.
- Do not trust client-side totals.
- Recalculate financial totals server-side.
- Prevent cross-company IDOR/access.
- Log sensitive operations.

---

## 20. UI Rules

All list pages should support:

- Search
- Pagination
- Sorting
- Filters
- Status
- Company
- Date range where relevant
- Export where authorized

Every major page should provide:

- Loading state
- Empty state
- Error state
- Success feedback
- Confirmation for destructive/sensitive actions

Use consistent status badges.

---

## 21. Development Workflow

The AI agent must work in small phases.

Recommended sequence:

1. Foundation
2. Authentication
3. RBAC
4. Multi-company
5. Master data
6. Warehouse
7. Inventory
8. Purchasing
9. Sales
10. Finance
11. AR/AP
12. Accounting engine
13. Assets
14. Intercompany
15. Consolidation
16. Reports
17. Audit/security
18. Testing
19. Production readiness

Do not implement all phases in one uncontrolled change.

Before each phase:

- Read PRD.md
- Read DATABASE_SCHEMA.md
- Read ACCOUNTING_RULES.md
- Inspect existing code
- Identify dependencies
- Plan changes

After each phase:

- Run type checks
- Run lint
- Run tests
- Verify database migrations/schema
- Verify authorization
- Update task status
- Do not silently skip failures

---

## 22. Change Management

Before changing a database table:

1. Check DATABASE_SCHEMA.md.
2. Check existing migrations/schema.
3. Check dependencies.
4. Determine whether existing data is affected.
5. Create a safe migration.
6. Update documentation.

Never drop or rename production columns casually.

Never reset production data.

Never run destructive seed logic against an existing database.

---

## 23. Testing Requirements

Minimum tests:

### Multi-company

- User cannot read another unauthorized company.
- Owner can access authorized companies.
- Consolidated user can read permitted company data.

### Inventory

- Receipt increases stock.
- Issue decreases stock.
- Transfer balances source/destination.
- Negative stock rule works.
- Stock adjustment requires authorization.

### Accounting

- Every posted journal balances.
- Unbalanced journal cannot post.
- Payment creates correct entries.
- Reversal creates opposite entries.
- Closed period rejects posting.

### Intercompany

- Both company sides are created.
- Intercompany balances reconcile.
- Consolidation eliminates internal balances.

### Security

- Unauthorized company access is rejected.
- Unauthorized role actions are rejected.
- Client-submitted totals are not trusted.

---

## 24. Coding Quality

Prefer:

- Small functions
- Explicit types
- Reusable services
- Clear naming
- Database transactions
- Idempotent operations where appropriate

Avoid:

- Giant components
- Giant route handlers
- `any`
- Duplicate business logic
- Magic financial constants
- Hidden side effects
- Direct database access from UI
- Hard-coded company IDs
- Hard-coded approval thresholds

---

## 25. Definition of Done

A feature is not complete until:

- UI works
- Server validation exists
- Authorization exists
- Database operation is correct
- Business rules are enforced
- Errors are handled
- Audit requirements are satisfied
- Tests pass
- Typecheck passes
- Lint passes
- Documentation is updated where needed

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
