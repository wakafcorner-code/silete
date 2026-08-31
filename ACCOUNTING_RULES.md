# ACCOUNTING_RULES.md

# ERP Manajemen — Accounting Rules

## 1. Purpose

This document defines the accounting invariants and posting rules that the AI agent must follow.

Accounting is a critical domain.

Do not change these rules casually.

If a business requirement conflicts with an accounting rule, stop and request an explicit design decision rather than silently changing the behavior.

---

# 2. Fundamental Principle

The system uses double-entry accounting.

Every posted journal must satisfy:

```text
TOTAL DEBIT = TOTAL CREDIT
```

No exception.

A journal must not be posted if:

```text
total_debit != total_credit
```

---

# 3. Journal Line Rules

Each journal line must have:

- Account
- Company
- Debit or Credit
- Description where appropriate

A line must not have both debit and credit:

```text
debit > 0 AND credit > 0
```

is invalid.

A line must not have:

```text
debit = 0 AND credit = 0
```

unless the implementation explicitly supports zero lines, which is not recommended.

---

# 4. Financial Amount Rules

Money:

```text
DECIMAL(18,2)
```

Never use JavaScript floating point for authoritative accounting calculations.

Perform monetary calculations using decimal-safe arithmetic.

Do not trust totals submitted by the browser.

Server-side services must calculate or verify:

- Subtotal
- Discount
- Tax
- Grand total
- Payment allocation
- Outstanding amount
- Journal amounts

---

# 5. Accounting Equation

The balance sheet must satisfy:

```text
ASSETS = LIABILITIES + EQUITY
```

If the report does not balance, the system must show an accounting integrity error.

Do not hide the difference.

---

# 6. Account Normal Balances

General convention:

```text
ASSET
Normal balance: DEBIT

LIABILITY
Normal balance: CREDIT

EQUITY
Normal balance: CREDIT

REVENUE
Normal balance: CREDIT

COGS
Normal balance: DEBIT

EXPENSE
Normal balance: DEBIT
```

---

# 7. Revenue Recognition

Do not treat every cash receipt as revenue.

Differentiate:

```text
Revenue
Capital injection
Loan proceeds
Customer advance
Transfer between accounts
Intercompany settlement
```

A cash receipt is not automatically revenue.

---

# 8. Expense Recognition

Do not treat every cash payment as expense.

Differentiate:

```text
Operating expense
Asset acquisition
Loan repayment
Owner withdrawal/dividend
Supplier payment for inventory
Transfer between accounts
Intercompany settlement
```

---

# 9. Sales — Credit Sale

Example:

```text
Sales invoice = Rp10,000,000
```

Basic entry:

```text
Debit  Accounts Receivable     10,000,000
Credit Sales Revenue           10,000,000
```

If inventory is sold and perpetual inventory accounting is used:

```text
Debit  Cost of Goods Sold
Credit Inventory
```

COGS amount must come from the configured inventory valuation method.

---

# 10. Sales — Cash Sale

Example:

```text
Cash sale = Rp10,000,000
```

Entry:

```text
Debit  Cash/Bank               10,000,000
Credit Sales Revenue           10,000,000
```

Inventory COGS entry is separate when applicable.

---

# 11. Customer Payment

Customer pays outstanding invoice:

```text
Debit  Cash/Bank
Credit Accounts Receivable
```

The payment must not create new revenue.

---

# 12. Customer Advance

If money is received before revenue recognition:

```text
Debit  Cash/Bank
Credit Customer Advances / Contract Liability
```

It must not automatically be posted to Sales Revenue.

---

# 13. Purchase of Inventory on Credit

Example:

```text
Inventory = Rp5,000,000
```

Basic entry:

```text
Debit  Inventory
Credit Accounts Payable
```

Exact timing may depend on the configured purchasing/accounting flow.

---

# 14. Supplier Payment

```text
Debit  Accounts Payable
Credit Cash/Bank
```

Supplier payment is not a new expense.

---

# 15. Operating Expense Paid Immediately

Example:

```text
Internet expense = Rp1,000,000
```

Entry:

```text
Debit  Internet Expense       1,000,000
Credit Cash/Bank              1,000,000
```

---

# 16. Expense Accrued but Not Paid

Example:

```text
Utility expense = Rp2,000,000
```

Entry:

```text
Debit  Utilities Expense      2,000,000
Credit Accrued Liability      2,000,000
```

When paid:

```text
Debit  Accrued Liability      2,000,000
Credit Cash/Bank              2,000,000
```

---

# 17. Fixed Asset Acquisition

Example:

```text
Equipment = Rp20,000,000
```

Entry:

```text
Debit  Fixed Asset             20,000,000
Credit Cash/Bank               20,000,000
```

Do not post the full acquisition cost directly to operating expense when the item qualifies as a fixed asset under the configured capitalization policy.

Capitalization thresholds must be configurable.

---

# 18. Depreciation

Straight-line formula:

```text
Depreciable Amount =
Acquisition Cost - Residual Value

Periodic Depreciation =
Depreciable Amount / Useful Life
```

Entry:

```text
Debit  Depreciation Expense
Credit Accumulated Depreciation
```

Never credit the original asset cost for ordinary depreciation.

---

# 19. Asset Disposal

Disposal must account for:

- Original cost
- Accumulated depreciation
- Proceeds
- Gain/loss

Do not simply delete the asset.

Create a controlled disposal transaction and journal.

---

# 20. Cash Transfer

Transfer between own cash/bank accounts is not revenue or expense.

Example:

```text
Bank A → Bank B
Rp5,000,000
```

Entry:

```text
Debit  Bank B                 5,000,000
Credit Bank A                 5,000,000
```

---

# 21. Owner Capital Injection

Example:

```text
Owner invests Rp50,000,000
```

Entry:

```text
Debit  Cash/Bank              50,000,000
Credit Capital                50,000,000
```

Do not classify capital injection as revenue.

---

# 22. Loan Receipt

Example:

```text
Loan received = Rp100,000,000
```

Entry:

```text
Debit  Cash/Bank             100,000,000
Credit Loan Payable          100,000,000
```

Do not classify loan proceeds as revenue.

---

# 23. Loan Repayment

Principal:

```text
Debit  Loan Payable
Credit Cash/Bank
```

Interest:

```text
Debit  Interest Expense
Credit Cash/Bank / Interest Payable
```

Principal and interest must be distinguishable.

---

# 24. Inventory

Inventory is an asset.

When inventory is received:

```text
Debit  Inventory
Credit Accounts Payable / Cash
```

When inventory is sold under perpetual inventory accounting:

```text
Debit  COGS
Credit Inventory
```

Inventory value must use the configured valuation method.

Supported initial methods:

- Weighted Average
- FIFO

Only implement one as the project default unless a clear business decision specifies otherwise.

---

# 25. Inventory Transfer Within Same Company

Moving goods between warehouses in the same company does not create revenue.

Accounting effect is normally:

```text
No P&L impact
```

Inventory quantity/value moves from source warehouse to destination warehouse.

If the system uses only company-level inventory accounting, no financial journal may be required for a same-company warehouse transfer.

---

# 26. Inventory Adjustment

Adjustment requires:

- Reason
- User
- Approval where configured
- Reference document

Increase:

```text
Debit  Inventory
Credit Inventory Adjustment Gain / relevant account
```

Decrease:

```text
Debit  Inventory Adjustment Loss / relevant account
Credit Inventory
```

Exact adjustment accounts must be configurable.

---

# 27. Accounts Receivable

When an invoice is posted:

```text
Debit  Accounts Receivable
Credit Revenue
```

When paid:

```text
Debit  Cash/Bank
Credit Accounts Receivable
```

Outstanding balance:

```text
Original Invoice
- Allocated Payments
= Outstanding
```

---

# 28. Accounts Payable

When supplier invoice is posted:

```text
Debit  Inventory / Expense / Asset
Credit Accounts Payable
```

When paid:

```text
Debit  Accounts Payable
Credit Cash/Bank
```

---

# 29. Payment Allocation

A payment allocation cannot exceed:

```text
Outstanding Invoice Amount
```

unless the system explicitly records the excess as:

- Customer advance
- Supplier advance
- Credit balance
- Refund

Never silently over-allocate.

---

# 30. Credit Notes

Customer credit note should reverse or reduce the appropriate original revenue/receivable.

Example:

```text
Debit  Sales Returns / Revenue Adjustment
Credit Accounts Receivable
```

Inventory return may require:

```text
Debit  Inventory
Credit COGS
```

depending on the original transaction and inventory policy.

---

# 31. Debit Notes

Debit notes must be modeled according to the underlying business event and must not be used as arbitrary balance changes.

---

# 32. Tax

Tax handling must be configurable.

Do not hard-code one tax rate into accounting logic.

If applicable, separate:

```text
Net amount
Tax amount
Gross amount
```

Tax accounts should be configurable.

---

# 33. Discounts

Discount treatment must be consistent.

For sales:

```text
Gross Sales
- Discount
= Net Revenue
```

For purchases, the system must follow the configured inventory/expense cost policy.

Do not allow UI totals to override server-calculated totals.

---

# 34. Journal Posting Lifecycle

A journal should follow:

```text
DRAFT
↓
VALIDATE
↓
POSTED
```

Validation must check:

- Company
- Financial period
- Accounts
- Debit/credit
- Balance
- Source reference
- Authorization

---

# 35. Reversal

Posted transactions cannot be edited directly.

To reverse:

```text
Original Journal
↓
Create Reversal Journal
↓
Opposite debit/credit
↓
Reference original journal
```

Example:

Original:

```text
Debit Cash       1,000
Credit Revenue   1,000
```

Reversal:

```text
Debit Revenue    1,000
Credit Cash      1,000
```

---

# 36. Financial Period Closing

Before closing:

- Journals balanced
- No invalid posted transactions
- Required reconciliations completed
- Critical approvals completed
- AR/AP integrity checked
- Inventory integrity checked
- Cash/bank integrity checked

After CLOSED:

- No normal posting
- No edits to posted entries
- No deletion

Corrections must use an authorized open period.

---

# 37. Intercompany Accounting

Intercompany transactions represent transactions between entities in the same reporting group.

Example:

Company A sells goods to Company B for Rp10,000,000.

Company A:

```text
Debit  Intercompany Receivable       10,000,000
Credit Intercompany Revenue          10,000,000
```

Company B:

```text
Debit  Inventory / Expense           10,000,000
Credit Intercompany Payable          10,000,000
```

The implementation must ensure both sides reference the same intercompany transaction.

---

# 38. Intercompany Settlement

When Company B pays Company A:

Company A:

```text
Debit  Bank
Credit Intercompany Receivable
```

Company B:

```text
Debit  Intercompany Payable
Credit Bank
```

The two balances must reconcile.

---

# 39. Intercompany Elimination

For consolidated reporting, internal transactions must be eliminated.

Example:

Company A internal revenue:

```text
20,000,000
```

Company B internal purchase:

```text
20,000,000
```

Consolidation must remove the internal transaction from group-level revenue/expense where required.

Intercompany receivable and payable must also be eliminated.

Do not alter the original company books to perform consolidation.

Elimination should occur in the reporting/consolidation layer or through dedicated elimination entries.

---

# 40. Consolidated Profit

Conceptually:

```text
Consolidated Revenue
=
Company Revenue
-
Internal Revenue Eliminations
```

```text
Consolidated Expenses
=
Company Expenses
-
Internal Expense Eliminations
```

The exact treatment of unrealized intercompany profit in inventory must be addressed if the group later requires full consolidation accounting.

---

# 41. Cash Flow Classification

Cash flow must be classified as:

## Operating

Examples:

- Customer receipts
- Supplier payments
- Salary
- Utilities
- Operating expenses

## Investing

Examples:

- Purchase of fixed assets
- Sale of fixed assets

## Financing

Examples:

- Capital injection
- Loan proceeds
- Loan principal repayment
- Dividends

Transfers between the company's own cash/bank accounts are not external cash flow.

---

# 42. Profit vs Cash

The system must never equate:

```textProfit = Cash Increase
```

Revenue can be recognized before payment.

Expenses can be recognized before payment.

Asset purchases affect cash and balance sheet differently from operating expenses.

Loans affect cash and liabilities, not revenue.

---

# 43. Accounting Integrity Checks

The system should provide automated checks:

### Check 1

```text
Every POSTED journal balances.
```

### Check 2

```text
Trial Balance total debit = total credit.
```

### Check 3

```text
Balance Sheet balances.
```

### Check 4

```text
AR outstanding = invoices - allocations.
```

### Check 5

```text
AP outstanding = supplier invoices - allocations.
```

### Check 6

```text
Cash balance agrees with posted cash transactions.
```

### Check 7

```text
Bank balance agrees with posted bank transactions,
subject to reconciliation differences.
```

### Check 8

```text
Intercompany receivable/payable can be reconciled.
```

---

# 44. Anti-Patterns

Never:

- Treat every cash-in as revenue.
- Treat every cash-out as expense.
- Change posted journals directly.
- Delete posted transactions.
- Allow unbalanced journals.
- Use floating point for money.
- Trust browser-submitted totals.
- Mix company data.
- Create intercompany revenue without the destination-side record.
- Add intercompany transactions to consolidated revenue without elimination.
- Close a period while silently leaving accounting errors.

---

# 45. Required Auditability

Every posted accounting entry must be traceable:

```text
Financial Report
↓
Journal
↓
Source Document
↓
Operational Transaction
↓
User
↓
Timestamp
```

Example:

```text
P&L
↓
Sales Revenue
↓
Journal JRN-202608-0012
↓
Invoice INV-202608-0010
↓
Sales Order SO-202608-0008
↓
Customer
```

---

# 46. Change Control

Any change to these rules must:

1. Be explicitly approved by the project owner.
2. Be documented.
3. Update this file.
4. Update related tests.
5. Review affected journal logic.
6. Review affected reports.
7. Test existing transactions.

The AI agent must not silently change accounting semantics.
