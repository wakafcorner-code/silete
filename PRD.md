# PRD.md

# ERP Manajemen — Product Requirements Document

## 1. Product Overview

ERP Manajemen is a multi-company ERP and financial management application built with Next.js and MySQL.

The system is intended to manage two companies in a single database named:

`erp_manajemen`

The system connects administration, warehouse operations, purchasing, sales, finance, accounting, assets, intercompany transactions, and consolidated reporting.

---

## 2. Product Goal

The system must allow management to answer:

- How much cash does each company have?
- How much is in each bank account?
- What goods and inventory are available?
- What was purchased?
- What was sold?
- What expenses were incurred?
- Who approved each expense?
- How much is owed to suppliers?
- How much customers owe?
- What assets are owned?
- What is the profit/loss?
- What is the cash flow?
- What transactions occurred between Company A and Company B?
- What is the consolidated position after intercompany elimination?

---

## 3. Technology

### Application

- Next.js
- TypeScript
- App Router
- Server Actions and/or Route Handlers
- Tailwind CSS
- shadcn/ui

### Database

- MySQL/MariaDB
- XAMPP during local development
- Database: `erp_manajemen`

### Validation

- Zod

### Authentication / Authorization

- Server-side authenticated sessions
- RBAC
- Company-level access control

The exact authentication library may be selected during implementation, but authorization must remain server-side.

---

## 4. Core Architecture

```text
Next.js UI
   ↓
Server Action / Route Handler
   ↓
Zod Validation
   ↓
Authorization
   ↓
Service Layer
   ↓
Database Transaction
   ↓
MySQL / MariaDB
```

Accounting is a domain service, not a UI responsibility.

---

## 5. Companies

The system must support at least:

```text
Company A
Company B
```

The design must remain extensible to more companies.

Each company can have:

- Branches
- Warehouses
- Users
- Cash accounts
- Bank accounts
- Customers
- Suppliers
- Inventory
- Assets
- Financial records

---

## 6. Roles

### Super Admin

Full system access.

### Owner / Director

Management dashboards, reports, approvals, and permitted operational visibility.

### Company Admin

Administration for assigned company.

### Warehouse Admin

Inventory and warehouse operations.

### Purchasing

Purchase requests and purchase orders.

### Sales

Sales orders and customer operations.

### Finance

Cash, bank, expenses, payments, AR/AP.

### Finance Manager

Finance plus approvals, reconciliation, and closing functions.

### Auditor

Read-only access to permitted records, reports, and audit trail.

---

# 7. Module Requirements

## 7.1 Dashboard

Dashboard must provide:

- Revenue
- Expense
- Net profit
- Cash
- Bank
- Inventory value
- Receivables
- Payables
- Fixed assets
- Pending approvals
- Overdue receivables
- Overdue payables
- Low stock

Filters:

- Company
- Branch
- Warehouse
- Date range

Owner dashboard must support:

- Company A
- Company B
- Consolidated

---

## 7.2 Administration

Manage:

- Companies
- Branches
- Warehouses
- Users
- Roles
- Permissions
- Company-user assignments
- Financial periods
- Document numbering
- System settings

---

## 7.3 Master Data

### Products

Fields:

- SKU
- Barcode
- Name
- Category
- Unit
- Cost
- Selling price
- Minimum stock
- Maximum stock
- Status

### Customers

- Code
- Name
- Contact
- Address
- Tax information where required
- Payment terms
- Credit limit
- Status

### Suppliers

- Code
- Name
- Contact
- Address
- Tax information where required
- Payment terms
- Status

---

# 8. Warehouse

## 8.1 Goods Receipt

Workflow:

```text
PO
↓
Goods Receipt
↓
Inspection
↓
Stock Increase
```

Requirements:

- Partial receipt
- Quantity validation
- Warehouse selection
- Reference PO
- Attachments
- Audit trail

---

## 8.2 Goods Issue

Reasons:

- Sale
- Internal use
- Maintenance
- Damage
- Sample
- Transfer
- Adjustment

Workflow:

```text
Request
↓
Approval where required
↓
Picking
↓
Goods Issue
↓
Stock Decrease
```

---

## 8.3 Warehouse Transfer

```text
Warehouse A
↓
Transfer Request
↓
Approval
↓
Transfer Out
↓
IN_TRANSIT
↓
Transfer In
↓
Warehouse B
```

---

## 8.4 Stock Opname

Requirements:

- Snapshot/book quantity
- Physical quantity
- Difference
- Reason
- Approval
- Adjustment transaction
- Audit trail

---

## 8.5 Inventory Reports

- Stock balance
- Stock card
- Inventory valuation
- Goods receipt report
- Goods issue report
- Transfer report
- Adjustment report
- Stock opname
- Low stock
- Slow-moving inventory
- Fast-moving inventory

---

# 9. Purchasing

Workflow:

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
Accounts Payable
↓
Payment
```

Statuses:

- DRAFT
- SUBMITTED
- APPROVED
- REJECTED
- ORDERED
- PARTIALLY_RECEIVED
- RECEIVED
- INVOICED
- PARTIALLY_PAID
- PAID
- CANCELLED

---

# 10. Sales

Workflow:

```text
Quotation
↓
Sales Order
↓
Approval
↓
Delivery
↓
Invoice
↓
Accounts Receivable
↓
Payment
```

Support:

- Partial delivery
- Partial payment
- Returns
- Customer credit
- Attachments
- Sales reports

---

# 11. Finance

## 11.1 Cash

Support:

- Cash in
- Cash out
- Transfer
- Adjustment
- Opening balance

## 11.2 Bank

Support:

- Bank receipt
- Bank payment
- Bank transfer
- Adjustment
- Reconciliation

## 11.3 Expenses

Workflow:

```text
DRAFT
↓
SUBMITTED
↓
REVIEW
↓
APPROVED
↓
PAID
```

Expense categories:

- Salary
- Transportation
- Fuel
- Utilities
- Internet
- Rent
- Maintenance
- Marketing
- Office supplies
- Travel
- Taxes
- Other operating expenses

Approval thresholds must be configurable.

---

# 12. Accounts Receivable

Requirements:

- Invoice
- Outstanding amount
- Payment allocation
- Due date
- Aging
- Overdue status
- Customer statement

Aging buckets:

- Current
- 1–30
- 31–60
- 61–90
- >90 days

---

# 13. Accounts Payable

Requirements:

- Supplier invoice
- Outstanding amount
- Payment allocation
- Due date
- Aging
- Overdue status
- Supplier statement

---

# 14. Fixed Assets

Support:

- Asset registration
- Acquisition
- Transfer location
- Responsible person
- Depreciation
- Disposal
- Asset history

Minimum depreciation data:

- Cost
- Residual value
- Useful life
- Method
- Accumulated depreciation
- Book value

---

# 15. Accounting

The system must use double-entry accounting.

Core modules:

- Chart of Accounts
- Journal Entries
- General Ledger
- Trial Balance
- Financial Periods
- Journal reversal
- Adjustments

Every posted financial event must be traceable to a source document.

---

# 16. Chart of Accounts

Minimum account classes:

```text
1 ASSET
2 LIABILITY
3 EQUITY
4 REVENUE
5 COST OF GOODS SOLD
6 EXPENSE
```

Example accounts:

```text
1100 Cash
1200 Bank
1300 Accounts Receivable
1400 Inventory
1500 Fixed Assets
1590 Accumulated Depreciation

2100 Accounts Payable
2200 Intercompany Payable
2300 Loans

3100 Capital
3200 Retained Earnings

4100 Sales Revenue
4200 Service Revenue

5100 Cost of Goods Sold

6100 Salary Expense
6200 Transportation Expense
6300 Utilities Expense
6400 Marketing Expense
6500 Maintenance Expense
```

COA must remain configurable.

---

# 17. Financial Reports

Required:

### Profit & Loss

```text
Revenue
- COGS
= Gross Profit
- Operating Expenses
= Operating Profit
+/- Other Income/Expense
= Net Profit
```

### Balance Sheet

```text
Assets
=
Liabilities + Equity
```

### Cash Flow

```text
Opening Cash
+ Operating
+ Investing
+ Financing
= Closing Cash
```

### Other Reports

- Trial Balance
- General Ledger
- Cash position
- Bank position
- AR aging
- AP aging
- Inventory valuation
- Asset register
- Expense report
- Revenue report

---

# 18. Intercompany

The system must support transactions between companies.

Example:

```text
Company A
→ sells goods
→ Company B
```

The system creates both sides:

```text
Company A
Intercompany Receivable
Revenue

Company B
Inventory / Expense
Intercompany Payable
```

The two sides must share a common intercompany reference.

---

# 19. Intercompany Reconciliation

System must identify:

- Matching receivable/payable
- Unmatched transactions
- Amount differences
- Date differences
- Settlement status

Statuses:

- OPEN
- MATCHED
- PARTIALLY_MATCHED
- SETTLED
- DISPUTED
- CANCELLED

---

# 20. Consolidation

Consolidated report:

```text
Company A
+
Company B
-
Intercompany Elimination
=
Group
```

Reports must support:

- Consolidated P&L
- Consolidated Balance Sheet
- Consolidated Cash Flow
- Consolidated AR/AP
- Consolidated inventory
- Consolidated asset position

---

# 21. Approval Center

Central page:

```text
Expense approvals
Purchase approvals
Payment approvals
Stock adjustments
Asset approvals
Intercompany approvals
```

Actions:

- Approve
- Reject
- Request revision

Every approval must be audited.

---

# 22. Audit Trail

Audit events:

- Create
- Update
- Submit
- Approve
- Reject
- Post
- Reverse
- Void
- Delete draft
- Login
- Permission change
- Company assignment change
- Period close

---

# 23. Attachments

Supported documents:

- Invoice
- Receipt
- Transfer proof
- Purchase order
- Delivery note
- Contract
- Asset document
- Stock opname evidence

Every attachment must belong to a known entity and be permission checked.

---

# 24. Document Numbering

Examples:

```text
PR-202608-0001
PO-202608-0001
GR-202608-0001
SO-202608-0001
INV-202608-0001
EXP-202608-0001
PAY-202608-0001
AST-202608-0001
JRN-202608-0001
IC-202608-0001
```

Number generation must be server-side and concurrency-safe.

---

# 25. Non-Functional Requirements

### Security

- Server-side authorization
- Company isolation
- Input validation
- Audit logging
- Secure file handling

### Reliability

- Database transactions for financial operations
- No partial financial posting
- Idempotency where appropriate

### Performance

- Pagination for large lists
- Indexed company/date/reference fields
- Avoid N+1 queries
- Server-side filtering

### Maintainability

- Service layer
- Reusable components
- Typed database access
- Tests for financial rules

---

# 26. MVP

Phase 1:

- Auth
- Users
- Roles
- Companies
- Branches
- Warehouses
- Master data

Phase 2:

- Inventory
- Stock movement
- Stock opname

Phase 3:

- Purchasing
- Sales

Phase 4:

- Cash
- Bank
- Expenses
- Payments
- AR/AP

Phase 5:

- Accounting engine
- COA
- Journal
- Ledger
- P&L
- Balance Sheet
- Cash Flow

Phase 6:

- Assets
- Intercompany
- Consolidation

Phase 7:

- Reports
- Audit
- Notifications
- Hardening

---

# 27. Definition of Done

A module is complete when:

- Requirements implemented
- Authorization implemented
- Validation implemented
- Database operation tested
- Business rules tested
- Audit requirements implemented
- Error states handled
- UI responsive
- Typecheck passes
- Lint passes
- Tests pass
- Documentation updated
