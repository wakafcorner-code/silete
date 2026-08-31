# ERP Manajemen — Security & Defense-in-Depth Architecture

This document details the security model, cryptographic standards, multi-tenant isolation guarantees, role-based access control (RBAC), and vulnerability mitigation policies for **ERP Manajemen**.

---

## 1. Threat Model & Security Principles

1. **Zero-Trust Multi-Company Isolation**:
   - The server never trusts client-supplied `company_id` without validating against the authenticated user's session and assigned permissions.
   - Users belonging to Company A cannot view, query, or mutate Company B's records (zero IDOR risk).
2. **Server-Side Authorization Boundary**:
   - UI disabling or hiding of buttons is treated purely as a usability feature. Every mutation endpoint independently enforces permission checks on the server.
3. **Double-Entry Financial Immutability**:
   - Posted financial journals cannot be deleted or directly modified. Corrective actions require authorized reversal or adjustment journals in open financial periods.
4. **Parameterized SQL Queries**:
   - 100% of database queries utilize parameterized prepared statements via `mysql2`. String concatenation of untrusted input into SQL queries is strictly prohibited.

---

## 2. Authentication & Session Security

- **Token Mechanism**: Cryptographically signed JSON Web Tokens (JWT) using `HS256` / `RS256` with strong random 64-character secret.
- **Cookie Security**:
  - `HttpOnly`: Accessible only by server-side code, mitigating XSS token theft.
  - `Secure`: Transmitted exclusively over encrypted HTTPS connections in production.
  - `SameSite=Strict`: Prevents Cross-Site Request Forgery (CSRF) attacks.
  - `Max-Age`: Configured to 8 hours by default (`AUTH_EXPIRES_IN=8h`).
- **Password Hashing**: Industry-standard `bcrypt` with minimum work factor / salt rounds of 10.

---

## 3. Role-Based Access Control (RBAC) Matrix

| Role | Scope & Permissions | Key Permitted Actions |
| :--- | :--- | :--- |
| **Super Admin** | Global (All Companies) | Manage companies, users, system settings, global audit logs. |
| **Owner / Director** | Multi-Company (Assigned) | View executive dashboards, approve large expenses, view consolidated reports. |
| **Company Admin** | Single Company | Master data, users, branches, company settings. |
| **Finance Manager** | Single Company | Close/reopen financial periods, approve journals, review GL. |
| **Finance** | Single Company | Create journals, cash/bank transactions, process AR/AP payments. |
| **Purchasing** | Single Company | Create PRs, generate POs, receive supplier invoices. |
| **Sales** | Single Company | Create quotations, sales orders, customer invoices. |
| **Warehouse Admin**| Single Company | Goods receipts, delivery order issuance, inventory transfers. |
| **Auditor** | Read-Only (All Modules) | View GL, journals, trial balance, and audit logs without mutation rights. |

---

## 4. Input Validation & Defense-in-Depth

- **Server-Side Schema Validation**:
  - All incoming HTTP request payloads are strictly validated using `Zod` schemas before reaching the business logic layer.
  - Unexpected or malicious fields are stripped automatically.
- **File Upload Protection**:
  - Strict MIME-type checking on attachments (`application/pdf`, `image/png`, `image/jpeg`, `application/vnd.openxmlformats-officedocument.*`).
  - Maximum upload size capped at **25 MB**.
  - File contents stored outside web root or in secure object storage with randomized non-executable filenames.

---

## 5. Security Audit Trail

All sensitive state-changing operations create immutable records in `audit_logs`:
- **Captured Fields**: `user_id`, `company_id`, `action` (`CREATE`, `UPDATE`, `APPROVE`, `POST`, `REVERSE`, `CANCEL`), `entity`, `entity_id`, `old_values` (JSON), `new_values` (JSON), `ip_address`, `user_agent`, `created_at`.
- **Integrity**: Standard application users have zero write/delete permissions on `audit_logs`.

---

## 6. Vulnerability Reporting

If you discover a potential security vulnerability within **ERP Manajemen**, please report it directly to the security response team at `security@yourcompany.com` with reproducible steps. Please do not disclose vulnerabilities publicly before a patch is released.
