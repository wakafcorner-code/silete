# DATABASE_SCHEMA.md

# ERP Manajemen — MySQL Database Schema

## 1. Database

Database:

```sql
CREATE DATABASE erp_manajemen
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Development environment:

```text
XAMPP
MySQL/MariaDB
localhost:3306
```

---

# 2. General Conventions

## Primary Keys

Use:

```text
BIGINT UNSIGNED AUTO_INCREMENT
```

unless there is a strong reason to use another strategy.

## Foreign Keys

Use explicit foreign keys wherever practical.

## Monetary Values

Use:

```text
DECIMAL(18,2)
```

Never use FLOAT or DOUBLE for money.

## Quantities

Use:

```text
DECIMAL(18,4)
```

for products that may have fractional quantities.

## Timestamps

Use:

```text
created_at
updated_at
```

and appropriate date fields such as:

```text
transaction_date
due_date
posting_date
```

## Soft Deletes

Use soft delete only for master/reference data where appropriate.

Do not use soft delete as a substitute for reversing posted accounting transactions.

---

# 3. Core Organization Tables

## companies

```text
id BIGINT PK
code VARCHAR(50) UNIQUE
name VARCHAR(255)
legal_name VARCHAR(255) NULL
tax_number VARCHAR(100) NULL
address TEXT NULL
phone VARCHAR(50) NULL
email VARCHAR(150) NULL
logo_path VARCHAR(500) NULL
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at
```

## branches

```text
id BIGINT PK
company_id BIGINT FK companies.id
code VARCHAR(50)
name VARCHAR(255)
address TEXT NULL
phone VARCHAR(50) NULL
manager_user_id BIGINT NULL
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

UNIQUE(company_id, code)
INDEX(company_id)
```

## warehouses

```text
id BIGINT PK
company_id BIGINT FK companies.id
branch_id BIGINT FK branches.id NULL
code VARCHAR(50)
name VARCHAR(255)
address TEXT NULL
pic_user_id BIGINT NULL
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

UNIQUE(company_id, code)
INDEX(company_id, branch_id)
```

---

# 4. Authentication and RBAC

## users

```text
id BIGINT PK
name VARCHAR(255)
email VARCHAR(255) UNIQUE
password_hash VARCHAR(255)
status ENUM('ACTIVE','INACTIVE','LOCKED')
last_login_at DATETIME NULL
created_at
updated_at
```

## roles

```text
id BIGINT PK
name VARCHAR(100) UNIQUE
description TEXT NULL
created_at
updated_at
```

## permissions

```text
id BIGINT PK
key VARCHAR(150) UNIQUE
description TEXT NULL
created_at
updated_at
```

## user_roles

```text
user_id BIGINT FK users.id
role_id BIGINT FK roles.id

PRIMARY KEY(user_id, role_id)
```

## role_permissions

```text
role_id BIGINT FK roles.id
permission_id BIGINT FK permissions.id

PRIMARY KEY(role_id, permission_id)
```

## user_companies

```text
user_id BIGINT FK users.id
company_id BIGINT FK companies.id
is_default BOOLEAN DEFAULT FALSE

PRIMARY KEY(user_id, company_id)
```

---

# 5. Master Data

## product_categories

```text
id BIGINT PK
company_id BIGINT FK companies.id NULL
code VARCHAR(50)
name VARCHAR(255)
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

INDEX(company_id)
```

`company_id = NULL` may be used for global categories if the implementation explicitly supports global master data.

## products

```text
id BIGINT PK
company_id BIGINT FK companies.id
category_id BIGINT FK product_categories.id NULL
sku VARCHAR(100)
barcode VARCHAR(100) NULL
name VARCHAR(255)
description TEXT NULL
unit VARCHAR(50)
cost_price DECIMAL(18,2) DEFAULT 0
selling_price DECIMAL(18,2) DEFAULT 0
minimum_stock DECIMAL(18,4) DEFAULT 0
maximum_stock DECIMAL(18,4) NULL
track_inventory BOOLEAN DEFAULT TRUE
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

UNIQUE(company_id, sku)
INDEX(company_id, category_id)
```

## customers

```text
id BIGINT PK
company_id BIGINT FK companies.id
code VARCHAR(50)
name VARCHAR(255)
phone VARCHAR(50) NULL
email VARCHAR(150) NULL
address TEXT NULL
tax_number VARCHAR(100) NULL
payment_terms_days INT DEFAULT 0
credit_limit DECIMAL(18,2) DEFAULT 0
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

UNIQUE(company_id, code)
```

## suppliers

```text
id BIGINT PK
company_id BIGINT FK companies.id
code VARCHAR(50)
name VARCHAR(255)
phone VARCHAR(50) NULL
email VARCHAR(150) NULL
address TEXT NULL
tax_number VARCHAR(100) NULL
payment_terms_days INT DEFAULT 0
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at

UNIQUE(company_id, code)
```

---

# 6. Inventory

## stock_balances

```text
id BIGINT PK
company_id BIGINT FK companies.id
warehouse_id BIGINT FK warehouses.id
product_id BIGINT FK products.id
quantity DECIMAL(18,4) DEFAULT 0
average_cost DECIMAL(18,2) DEFAULT 0
inventory_value DECIMAL(18,2) DEFAULT 0
updated_at

UNIQUE(warehouse_id, product_id)
INDEX(company_id, product_id)
```

## inventory_transactions

```text
id BIGINT PK
company_id BIGINT FK companies.id
warehouse_id BIGINT FK warehouses.id
product_id BIGINT FK products.id
transaction_type ENUM(
  'OPENING_BALANCE',
  'RECEIPT',
  'ISSUE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'RETURN_IN',
  'RETURN_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT'
)
quantity DECIMAL(18,4)
unit_cost DECIMAL(18,2) DEFAULT 0
total_cost DECIMAL(18,2) DEFAULT 0
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
reference_number VARCHAR(100) NULL
transaction_date DATETIME
created_by BIGINT FK users.id
created_at

INDEX(company_id, warehouse_id, product_id, transaction_date)
INDEX(reference_type, reference_id)
```

## stock_opnames

```text
id BIGINT PK
company_id BIGINT FK companies.id
warehouse_id BIGINT FK warehouses.id
opname_number VARCHAR(100)
opname_date DATETIME
status ENUM('DRAFT','COUNTING','SUBMITTED','APPROVED','POSTED','CANCELLED')
notes TEXT NULL
created_by BIGINT
approved_by BIGINT NULL
approved_at DATETIME NULL
created_at
updated_at
```

## stock_opname_items

```text
id BIGINT PK
stock_opname_id BIGINT FK stock_opnames.id
product_id BIGINT FK products.id
system_quantity DECIMAL(18,4)
physical_quantity DECIMAL(18,4)
difference_quantity DECIMAL(18,4)
unit_cost DECIMAL(18,2)
difference_value DECIMAL(18,2)
reason TEXT NULL
```

---

# 7. Purchasing

## purchase_requests

```text
id BIGINT PK
company_id BIGINT FK companies.id
branch_id BIGINT NULL
request_number VARCHAR(100)
request_date DATETIME
requested_by BIGINT FK users.id
status ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')
notes TEXT NULL
created_at
updated_at
```

## purchase_request_items

```text
id BIGINT PK
purchase_request_id BIGINT FK purchase_requests.id
product_id BIGINT FK products.id
quantity DECIMAL(18,4)
estimated_unit_cost DECIMAL(18,2)
notes TEXT NULL
```

## purchase_orders

```text
id BIGINT PK
company_id BIGINT FK companies.id
supplier_id BIGINT FK suppliers.id
po_number VARCHAR(100)
po_date DATETIME
status ENUM(
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
)
subtotal DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
grand_total DECIMAL(18,2)
notes TEXT NULL
created_by BIGINT
approved_by BIGINT NULL
created_at
updated_at
```

## purchase_order_items

```text
id BIGINT PK
purchase_order_id BIGINT FK purchase_orders.id
product_id BIGINT FK products.id
quantity DECIMAL(18,4)
unit_price DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
line_total DECIMAL(18,2)
```

## goods_receipts

```text
id BIGINT PK
company_id BIGINT FK companies.id
warehouse_id BIGINT FK warehouses.id
purchase_order_id BIGINT FK purchase_orders.id NULL
receipt_number VARCHAR(100)
receipt_date DATETIME
status ENUM('DRAFT','POSTED','CANCELLED')
notes TEXT NULL
created_by BIGINT
created_at
updated_at
```

## goods_receipt_items

```text
id BIGINT PK
goods_receipt_id BIGINT FK goods_receipts.id
purchase_order_item_id BIGINT FK purchase_order_items.id NULL
product_id BIGINT FK products.id
quantity DECIMAL(18,4)
unit_cost DECIMAL(18,2)
total_cost DECIMAL(18,2)
```

---

# 8. Sales

## sales_orders

```text
id BIGINT PK
company_id BIGINT FK companies.id
customer_id BIGINT FK customers.id
so_number VARCHAR(100)
so_date DATETIME
status ENUM(
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CANCELLED'
)
subtotal DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
grand_total DECIMAL(18,2)
created_by BIGINT
approved_by BIGINT NULL
created_at
updated_at
```

## sales_order_items

```text
id BIGINT PK
sales_order_id BIGINT FK sales_orders.id
product_id BIGINT FK products.id
quantity DECIMAL(18,4)
unit_price DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
line_total DECIMAL(18,2)
```

## deliveries

```text
id BIGINT PK
company_id BIGINT FK companies.id
warehouse_id BIGINT FK warehouses.id
sales_order_id BIGINT FK sales_orders.id NULL
delivery_number VARCHAR(100)
delivery_date DATETIME
status ENUM('DRAFT','POSTED','CANCELLED')
created_by BIGINT
created_at
updated_at
```

## delivery_items

```text
id BIGINT PK
delivery_id BIGINT FK deliveries.id
sales_order_item_id BIGINT FK sales_order_items.id NULL
product_id BIGINT FK products.id
quantity DECIMAL(18,4)
```

---

# 9. Invoices

## invoices

```text
id BIGINT PK
company_id BIGINT FK companies.id
customer_id BIGINT FK customers.id NULL
supplier_id BIGINT FK suppliers.id NULL
invoice_number VARCHAR(100)
invoice_type ENUM('SALES','PURCHASE')
invoice_date DATETIME
due_date DATETIME NULL
status ENUM('DRAFT','POSTED','PARTIALLY_PAID','PAID','VOID')
subtotal DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
grand_total DECIMAL(18,2)
created_by BIGINT
created_at
updated_at
```

## invoice_items

```text
id BIGINT PK
invoice_id BIGINT FK invoices.id
product_id BIGINT NULL
description VARCHAR(500)
quantity DECIMAL(18,4) DEFAULT 1
unit_price DECIMAL(18,2)
discount DECIMAL(18,2) DEFAULT 0
tax DECIMAL(18,2) DEFAULT 0
line_total DECIMAL(18,2)
```

---

# 10. Finance

## cash_accounts

```text
id BIGINT PK
company_id BIGINT FK companies.id
code VARCHAR(50)
name VARCHAR(255)
account_id BIGINT NULL
opening_balance DECIMAL(18,2) DEFAULT 0
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at
```

## bank_accounts

```text
id BIGINT PK
company_id BIGINT FK companies.id
bank_name VARCHAR(150)
account_number VARCHAR(100)
account_name VARCHAR(255)
currency VARCHAR(10) DEFAULT 'IDR'
account_id BIGINT NULL
opening_balance DECIMAL(18,2) DEFAULT 0
status ENUM('ACTIVE','INACTIVE')
created_at
updated_at
```

## cash_transactions

```text
id BIGINT PK
company_id BIGINT FK companies.id
cash_account_id BIGINT FK cash_accounts.id
transaction_type ENUM('IN','OUT','TRANSFER','ADJUSTMENT')
amount DECIMAL(18,2)
transaction_date DATETIME
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
description TEXT NULL
status ENUM('DRAFT','POSTED','VOID')
created_by BIGINT
created_at
updated_at
```

## bank_transactions

```text
id BIGINT PK
company_id BIGINT FK companies.id
bank_account_id BIGINT FK bank_accounts.id
transaction_type ENUM('IN','OUT','TRANSFER','ADJUSTMENT')
amount DECIMAL(18,2)
transaction_date DATETIME
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
description TEXT NULL
status ENUM('DRAFT','POSTED','VOID')
created_by BIGINT
created_at
updated_at
```

---

# 11. Expenses

## expense_categories

```text
id BIGINT PK
company_id BIGINT NULL
code VARCHAR(50)
name VARCHAR(255)
account_id BIGINT NULL
status ENUM('ACTIVE','INACTIVE')
```

## expenses

```text
id BIGINT PK
company_id BIGINT FK companies.id
branch_id BIGINT NULL
expense_number VARCHAR(100)
category_id BIGINT FK expense_categories.id
expense_date DATETIME
amount DECIMAL(18,2)
description TEXT
payment_method ENUM('CASH','BANK','CREDIT','OTHER')
cash_account_id BIGINT NULL
bank_account_id BIGINT NULL
status ENUM(
  'DRAFT',
  'SUBMITTED',
  'REVIEW',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELLED'
)
requested_by BIGINT
approved_by BIGINT NULL
approved_at DATETIME NULL
paid_at DATETIME NULL
created_at
updated_at
```

## expense_approvals

```text
id BIGINT PK
expense_id BIGINT FK expenses.id
approver_user_id BIGINT FK users.id
level INT
status ENUM('PENDING','APPROVED','REJECTED')
comment TEXT NULL
approved_at DATETIME NULL
created_at
```

---

# 12. Payments

## payments

```text
id BIGINT PK
company_id BIGINT FK companies.id
payment_number VARCHAR(100)
payment_type ENUM('RECEIPT','PAYMENT')
payment_date DATETIME
amount DECIMAL(18,2)
method ENUM('CASH','BANK','OTHER')
cash_account_id BIGINT NULL
bank_account_id BIGINT NULL
customer_id BIGINT NULL
supplier_id BIGINT NULL
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
status ENUM('DRAFT','POSTED','VOID')
created_by BIGINT
created_at
updated_at
```

## payment_allocations

```text
id BIGINT PK
payment_id BIGINT FK payments.id
invoice_id BIGINT FK invoices.id
allocated_amount DECIMAL(18,2)
created_at
```

---

# 13. AR/AP

## receivables

```text
id BIGINT PK
company_id BIGINT FK companies.id
customer_id BIGINT FK customers.id
invoice_id BIGINT FK invoices.id
original_amount DECIMAL(18,2)
paid_amount DECIMAL(18,2) DEFAULT 0
outstanding_amount DECIMAL(18,2)
due_date DATETIME NULL
status ENUM('OPEN','PARTIALLY_PAID','PAID','OVERDUE','VOID')
created_at
updated_at
```

## payables

```text
id BIGINT PK
company_id BIGINT FK companies.id
supplier_id BIGINT FK suppliers.id
invoice_id BIGINT FK invoices.id
original_amount DECIMAL(18,2)
paid_amount DECIMAL(18,2) DEFAULT 0
outstanding_amount DECIMAL(18,2)
due_date DATETIME NULL
status ENUM('OPEN','PARTIALLY_PAID','PAID','OVERDUE','VOID')
created_at
updated_at
```

---

# 14. Accounting

## accounts

```text
id BIGINT PK
company_id BIGINT NULL
code VARCHAR(50)
name VARCHAR(255)
account_type ENUM(
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COGS',
  'EXPENSE'
)
parent_id BIGINT NULL
is_control_account BOOLEAN DEFAULT FALSE
is_active BOOLEAN DEFAULT TRUE
created_at
updated_at

UNIQUE(company_id, code)
```

## journal_entries

```text
id BIGINT PK
company_id BIGINT FK companies.id
journal_number VARCHAR(100)
journal_date DATETIME
posting_date DATETIME
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
description TEXT
status ENUM('DRAFT','POSTED','REVERSED','VOID')
financial_period_id BIGINT
created_by BIGINT
posted_by BIGINT NULL
posted_at DATETIME NULL
created_at
updated_at
```

## journal_entry_items

```text
id BIGINT PK
journal_entry_id BIGINT FK journal_entries.id
account_id BIGINT FK accounts.id
debit DECIMAL(18,2) DEFAULT 0
credit DECIMAL(18,2) DEFAULT 0
description VARCHAR(500) NULL
company_id BIGINT FK companies.id
created_at
```

Constraint at application level:

```text
debit >= 0
credit >= 0
NOT (debit > 0 AND credit > 0)
```

Posted journal invariant:

```text
SUM(debit) = SUM(credit)
```

---

# 15. General Ledger

The preferred source of truth is posted journal entries.

If a materialized `general_ledger` table is implemented:

```text
id BIGINT PK
company_id BIGINT
journal_entry_id BIGINT
journal_entry_item_id BIGINT
account_id BIGINT
posting_date DATETIME
debit DECIMAL(18,2)
credit DECIMAL(18,2)
created_at
```

It must never become inconsistent with posted journals.

---

# 16. Financial Periods

## financial_periods

```text
id BIGINT PK
company_id BIGINT FK companies.id
year INT
month INT
start_date DATE
end_date DATE
status ENUM('OPEN','CLOSING','CLOSED')
closed_by BIGINT NULL
closed_at DATETIME NULL
created_at
updated_at

UNIQUE(company_id, year, month)
```

---

# 17. Fixed Assets

## asset_categories

```text
id BIGINT PK
company_id BIGINT NULL
code VARCHAR(50)
name VARCHAR(255)
default_useful_life_months INT NULL
default_account_id BIGINT NULL
accumulated_depreciation_account_id BIGINT NULL
depreciation_expense_account_id BIGINT NULL
status ENUM('ACTIVE','INACTIVE')
```

## assets

```text
id BIGINT PK
company_id BIGINT FK companies.id
asset_category_id BIGINT FK asset_categories.id
asset_code VARCHAR(100)
name VARCHAR(255)
acquisition_date DATE
acquisition_cost DECIMAL(18,2)
residual_value DECIMAL(18,2) DEFAULT 0
useful_life_months INT
depreciation_method ENUM('STRAIGHT_LINE')
accumulated_depreciation DECIMAL(18,2) DEFAULT 0
book_value DECIMAL(18,2)
location VARCHAR(255) NULL
responsible_user_id BIGINT NULL
status ENUM('ACTIVE','FULLY_DEPRECIATED','DISPOSED')
created_at
updated_at

UNIQUE(company_id, asset_code)
```

## asset_depreciations

```text
id BIGINT PK
asset_id BIGINT FK assets.id
financial_period_id BIGINT FK financial_periods.id
depreciation_date DATE
amount DECIMAL(18,2)
journal_entry_id BIGINT NULL
status ENUM('DRAFT','POSTED','VOID')
created_at
```

---

# 18. Intercompany

## intercompany_transactions

```text
id BIGINT PK
transaction_number VARCHAR(100) UNIQUE
source_company_id BIGINT FK companies.id
destination_company_id BIGINT FK companies.id
transaction_type ENUM(
  'SALE',
  'PURCHASE',
  'TRANSFER',
  'LOAN',
  'EXPENSE_RECHARGE',
  'OTHER'
)
transaction_date DATETIME
amount DECIMAL(18,2)
reference_type VARCHAR(50) NULL
reference_id BIGINT NULL
status ENUM(
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'POSTED',
  'MATCHED',
  'SETTLED',
  'DISPUTED',
  'CANCELLED'
)
created_by BIGINT
created_at
updated_at
```

## intercompany_entries

```text
id BIGINT PK
intercompany_transaction_id BIGINT FK intercompany_transactions.id
company_id BIGINT FK companies.id
journal_entry_id BIGINT FK journal_entries.id
side ENUM('SOURCE','DESTINATION')
created_at
```

## intercompany_settlements

```text
id BIGINT PK
intercompany_transaction_id BIGINT FK intercompany_transactions.id
settlement_date DATETIME
amount DECIMAL(18,2)
source_payment_id BIGINT NULL
destination_payment_id BIGINT NULL
status ENUM('OPEN','PARTIAL','SETTLED','DISPUTED')
created_at
updated_at
```

---

# 19. Audit and Attachments

## audit_logs

```text
id BIGINT PK
user_id BIGINT NULL
company_id BIGINT NULL
action VARCHAR(100)
module VARCHAR(100)
entity_type VARCHAR(100)
entity_id BIGINT NULL
old_values JSON NULL
new_values JSON NULL
ip_address VARCHAR(100) NULL
user_agent TEXT NULL
created_at

INDEX(company_id, created_at)
INDEX(entity_type, entity_id)
```

## attachments

```text
id BIGINT PK
company_id BIGINT NULL
reference_type VARCHAR(100)
reference_id BIGINT
category VARCHAR(50) NULL
notes TEXT NULL
file_name VARCHAR(255)
file_path VARCHAR(500)
mime_type VARCHAR(100)
file_size BIGINT
uploaded_by BIGINT
created_at

INDEX(reference_type, reference_id)
INDEX(company_id, category)
```

## notifications

```text
id BIGINT PK
user_id BIGINT
company_id BIGINT NULL
type VARCHAR(100)
title VARCHAR(255)
message TEXT
read_at DATETIME NULL
created_at
```

---

# 20. Important Indexes

At minimum, index:

- `company_id`
- `company_id, created_at`
- `company_id, transaction_date`
- `company_id, status`
- `warehouse_id, product_id`
- `customer_id`
- `supplier_id`
- `invoice_id`
- `reference_type, reference_id`
- `journal_entry_id`
- `account_id, posting_date`

Avoid excessive indexes on high-write tables without measuring performance.

---

# 21. Referential Integrity

Use foreign keys for critical relationships.

For posted financial records, avoid cascade deletes.

Recommended behavior:

```text
Master data:
RESTRICT / soft delete

Draft transaction:
May be cancelled/deleted according to rules

Posted transaction:
NEVER hard delete

Journal:
NEVER hard delete
```

---

# 22. Transactional Integrity

The following must execute in a database transaction:

- Posting invoice
- Posting payment
- Posting expense payment
- Posting goods receipt with financial impact
- Posting inventory adjustment
- Posting asset acquisition
- Posting depreciation
- Posting intercompany transaction
- Intercompany settlement
- Financial period close

If any required step fails, the entire operation must roll back.
