# SILETE — AI AGENT DEVELOPMENT RULES

## 1. PROJECT

Project name:
SILETE

Application type:
Multi-company tin trading ERP.

Framework:
Next.js + TypeScript

Database:
MySQLsil

Database environment:
XAMPP MySQL

ORM:
Prisma


## 2. COMPANIES

The initial companies are:

1. CV DEPATI TININDO MINING
2. CV SURYA TIMAH ANDALAN


## 3. INITIAL PARTNERS

1. Asu
2. Wandi
3. Feris
4. Asui

Partners must be stored as database records.

Never hardcode partner names in application logic.


## 4. MAIN BUSINESS FLOW

Partner
→ Purchase
→ Weighing
→ Warehouse
→ Stock
→ Sales
→ Customer/PT Timah
→ Invoice
→ Receivable
→ Payment
→ Cash/Bank
→ Accounting
→ Reports


## 5. MULTI COMPANY

Every transactional table must be associated
with a company.

Never mix transactions between companies.

Users may have access to one or more companies.

Company access must be checked server-side.


## 6. STOCK RULES

Stock can only change through stock movements.

Never directly modify stock balance.

Every stock movement must have:

- company
- warehouse
- transaction reference
- quantity
- movement type
- timestamp
- user

Negative stock is not allowed unless explicitly
enabled by a future business configuration.


## 7. PURCHASE RULES

A purchase must contain:

- company
- partner
- date
- material
- gross weight
- tare
- net weight
- price
- DPP
- tax
- total

Net weight:

gross weight - tare


## 8. SALES RULES

A sale must contain:

- company
- customer
- warehouse
- material
- quantity
- price
- DPP
- tax
- total

Before posting a sale:

Check available stock.

Do not allow negative stock.


## 9. PAYMENT RULES

Payments may be:

- full
- partial

A payment must reference:

- payable
  or
- receivable

Prevent duplicate payment.


## 10. ACCOUNTING

Posted transactions must create accounting entries.

Never silently modify accounting entries.

Corrections must use reversal/correction transactions.


## 11. POSTED TRANSACTIONS

Posted transactions must not be deleted.

If correction is required:

POSTED
→ CORRECTION REQUEST
→ APPROVAL
→ REVERSAL
→ CORRECT TRANSACTION


## 12. TAX

Tax rules must be configurable.

Never hardcode tax rates.

Tax calculations must be isolated
inside the tax service.


## 13. AUDIT TRAIL

Important actions must create audit logs.

Record:

- user
- action
- module
- record ID
- old value
- new value
- reason
- timestamp


## 14. SECURITY

Never trust client-side permission checks.

All important permission checks must happen
on the server.

Validate all user input.

Validate uploaded files.

Never expose database credentials.


## 15. DATABASE

Never modify Prisma schema without checking:

docs/DATABASE_SCHEMA.md

After changing schema:

1. Update schema
2. Create migration
3. Update documentation
4. Run tests


## 16. ACCOUNTING CHANGES

Never modify accounting behavior without reading:

docs/ACCOUNTING_RULES.md


## 17. BUSINESS CHANGES

Never modify business behavior without reading:

docs/BUSINESS_RULES.md


## 18. DEVELOPMENT PROCESS

Before coding:

1. Read AGENTS.md
2. Read relevant documentation
3. Inspect existing code
4. Explain implementation plan
5. Implement smallest safe change
6. Run tests
7. Run lint
8. Run typecheck
9. Report changed files


## 19. DO NOT

Do not:

- rewrite unrelated files
- delete working features
- bypass validation
- hardcode company IDs
- hardcode partner IDs
- hardcode tax rates
- directly edit stock balance
- delete posted transactions
- expose secrets
- create duplicate business logic


## 20. UI LANGUAGE

Application UI:
Indonesian

Database identifiers:
English

Code:
English

Business labels:
Indonesian


## 21. CODE QUALITY

Prefer:

- small services
- reusable components
- typed functions
- Zod validation
- Prisma transactions
- server-side authorization
- clear error handling


## 22. IMPORTANT

Do not implement the entire application in one task.

Development must follow:

Foundation
→ Authentication
→ Multi-company
→ Master Data
→ Partners
→ Purchasing
→ Warehouse
→ Sales
→ Finance
→ Tax
→ Accounting
→ Reports
→ Audit
→ Dashboard