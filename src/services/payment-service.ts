/**
 * ERP Manajemen — AR/AP Payment & Allocation Service (Phase 10)
 *
 * Workflow:
 *   Invoice → AR/AP (open, balance = original_amount)
 *   → Partial Payment → Allocation → balance decreases → status = 'partial'
 *   → Full Payment  → Allocation → balance = 0        → status = 'paid'
 *
 * Invariants:
 *   - balance_amount must never go negative
 *   - allocated_amount must not exceed outstanding balance_amount of the AR/AP record
 *   - paid_amount + balance_amount === original_amount at all times
 *   - A posted payment cannot be deleted
 *   - Payment amount must match sum of its allocations
 */

import { z } from "zod";
import { query, queryOne, execute, transaction } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult } from "@/types/pagination";
import { Receivable, Payable } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Payment {
  id: number;
  company_id: number;
  payment_no: string;
  payment_type: "customer_receipt" | "supplier_payment" | "other_receipt" | "other_payment";
  payment_date: string;
  amount: string;
  cash_account_id?: number | null;
  bank_account_id?: number | null;
  status: "draft" | "posted" | "cancelled";
  reference?: string | null;
  notes?: string | null;
  created_by?: number | null;
  // computed / joined
  allocated_total?: number;
  unallocated?: number;
}

export interface PaymentAllocation {
  id: number;
  payment_id: number;
  receivable_id?: number | null;
  payable_id?: number | null;
  allocated_amount: string;
}

export interface AgingBucket {
  not_due: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total: number;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const PaymentSchema = z.object({
  payment_no: z.string().min(3).max(50),
  payment_type: z.enum(["customer_receipt", "supplier_payment", "other_receipt", "other_payment"]),
  payment_date: z.string().min(1),
  amount: z.number().positive("Nominal pembayaran harus lebih dari 0"),
  cash_account_id: z.number().int().positive().optional().nullable(),
  bank_account_id: z.number().int().positive().optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type PaymentInput = z.infer<typeof PaymentSchema>;

export const AllocationSchema = z.object({
  payment_id: z.number().int().positive(),
  allocations: z.array(
    z.object({
      receivable_id: z.number().int().positive().optional().nullable(),
      payable_id: z.number().int().positive().optional().nullable(),
      allocated_amount: z.number().positive("Nominal alokasi harus lebih dari 0"),
    })
  ).min(1, "Minimal satu alokasi diperlukan"),
});

export type AllocationInput = z.infer<typeof AllocationSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── AR Functions ─────────────────────────────────────────────────────────────

export async function listReceivables(
  session: UserSessionPayload | null,
  params: { page?: number; limit?: number; status?: string; customerId?: number },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Receivable>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, customerId } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["r.company_id = ?"];
  const qp: (string | number)[] = [companyId];
  if (status && status !== "all") { conditions.push("r.status = ?"); qp.push(status); }
  if (customerId) { conditions.push("r.customer_id = ?"); qp.push(customerId); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM receivables r WHERE ${where}`, qp);
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Receivable[]>(
    `SELECT r.*, c.name AS customer_name, c.code AS customer_code,
            inv.invoice_no, inv.invoice_date AS inv_date, inv.due_date AS inv_due
     FROM receivables r
     JOIN customers c ON r.customer_id = c.id
     LEFT JOIN invoices inv ON r.invoice_id = inv.id
     WHERE ${where}
     ORDER BY r.invoice_date DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );
  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getReceivableById(
  session: UserSessionPayload | null,
  id: number
): Promise<Receivable | null> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const row = await queryOne<Receivable>(
    `SELECT r.*, c.name AS customer_name, c.code AS customer_code, inv.invoice_no
     FROM receivables r
     JOIN customers c ON r.customer_id = c.id
     LEFT JOIN invoices inv ON r.invoice_id = inv.id
     WHERE r.id = ?`,
    [id]
  );
  if (!row) return null;
  assertEntityCompanyAccess(session, row.company_id);
  return row;
}

export async function getARAgingReport(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<AgingBucket> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const rows = await query<{ bucket: string; total: number }[]>(
    `SELECT
       CASE
         WHEN due_date IS NULL OR due_date >= CURDATE()                        THEN 'not_due'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 1  AND 30                 THEN '1_30'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 31 AND 60                 THEN '31_60'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 61 AND 90                 THEN '61_90'
         ELSE 'over_90'
       END AS bucket,
       SUM(balance_amount) AS total
     FROM receivables
     WHERE company_id = ? AND status IN ('open','partial')
     GROUP BY bucket`,
    [companyId]
  );

  const aging: AgingBucket = { not_due: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
  for (const r of rows) {
    const val = Number(r.total);
    if (r.bucket === "not_due")  aging.not_due   += val;
    if (r.bucket === "1_30")     aging.days_1_30 += val;
    if (r.bucket === "31_60")    aging.days_31_60 += val;
    if (r.bucket === "61_90")    aging.days_61_90 += val;
    if (r.bucket === "over_90")  aging.over_90   += val;
  }
  aging.total = aging.not_due + aging.days_1_30 + aging.days_31_60 + aging.days_61_90 + aging.over_90;
  return aging;
}

// ─── AP Functions ─────────────────────────────────────────────────────────────

export async function listPayables(
  session: UserSessionPayload | null,
  params: { page?: number; limit?: number; status?: string; supplierId?: number },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Payable>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, supplierId } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.company_id = ?"];
  const qp: (string | number)[] = [companyId];
  if (status && status !== "all") { conditions.push("p.status = ?"); qp.push(status); }
  if (supplierId) { conditions.push("p.supplier_id = ?"); qp.push(supplierId); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM payables p WHERE ${where}`, qp);
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Payable[]>(
    `SELECT p.*, s.name AS supplier_name, s.code AS supplier_code, inv.invoice_no
     FROM payables p
     JOIN suppliers s ON p.supplier_id = s.id
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     WHERE ${where}
     ORDER BY p.invoice_date DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );
  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getAPAgingReport(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<AgingBucket> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const rows = await query<{ bucket: string; total: number }[]>(
    `SELECT
       CASE
         WHEN due_date IS NULL OR due_date >= CURDATE()                        THEN 'not_due'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 1  AND 30                 THEN '1_30'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 31 AND 60                 THEN '31_60'
         WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 61 AND 90                 THEN '61_90'
         ELSE 'over_90'
       END AS bucket,
       SUM(balance_amount) AS total
     FROM payables
     WHERE company_id = ? AND status IN ('open','partial')
     GROUP BY bucket`,
    [companyId]
  );

  const aging: AgingBucket = { not_due: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
  for (const r of rows) {
    const val = Number(r.total);
    if (r.bucket === "not_due")  aging.not_due   += val;
    if (r.bucket === "1_30")     aging.days_1_30 += val;
    if (r.bucket === "31_60")    aging.days_31_60 += val;
    if (r.bucket === "61_90")    aging.days_61_90 += val;
    if (r.bucket === "over_90")  aging.over_90   += val;
  }
  aging.total = aging.not_due + aging.days_1_30 + aging.days_31_60 + aging.days_61_90 + aging.over_90;
  return aging;
}

// ─── Payment Functions ────────────────────────────────────────────────────────

export async function createPayment(
  session: UserSessionPayload | null,
  input: PaymentInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; payment_no: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = PaymentSchema.parse(input);
  const userId = sessionUserId(session);

  // Validate that exactly one of cash_account_id or bank_account_id is provided
  if (!validated.cash_account_id && !validated.bank_account_id) {
    throw new Error("Wajib memilih akun kas atau akun bank untuk pembayaran.");
  }

  // Check duplicate payment_no
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM payments WHERE company_id = ? AND payment_no = ? LIMIT 1",
    [companyId, validated.payment_no]
  );
  if (existing) throw new Error(`Nomor pembayaran '${validated.payment_no}' sudah digunakan.`);

  const res = await execute(
    `INSERT INTO payments
       (company_id, payment_no, payment_type, payment_date, amount, cash_account_id, bank_account_id, status, reference, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [
      companyId,
      validated.payment_no,
      validated.payment_type,
      validated.payment_date,
      validated.amount.toFixed(2),
      validated.cash_account_id ?? null,
      validated.bank_account_id ?? null,
      validated.reference ?? null,
      validated.notes ?? null,
      userId,
    ]
  );

  await logAudit({
    user_id: userId, company_id: companyId,
    action: "CREATE", module: "payments", entity: "payments", entity_id: res.insertId,
    new_values: { ...validated },
  });

  return { id: res.insertId, payment_no: validated.payment_no };
}

export async function listPayments(
  session: UserSessionPayload | null,
  params: { page?: number; limit?: number; status?: string; paymentType?: string },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Payment>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, paymentType } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.company_id = ?"];
  const qp: (string | number)[] = [companyId];
  if (status && status !== "all") { conditions.push("p.status = ?"); qp.push(status); }
  if (paymentType) { conditions.push("p.payment_type = ?"); qp.push(paymentType); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM payments p WHERE ${where}`, qp);
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Payment[]>(
    `SELECT p.*,
            COALESCE(SUM(pa.allocated_amount), 0) AS allocated_total,
            (p.amount - COALESCE(SUM(pa.allocated_amount), 0)) AS unallocated
     FROM payments p
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );
  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Post a payment and atomically allocate it to AR/AP records.
 *
 * Invariants enforced inside a single database transaction:
 *   1. Payment must be in 'draft' status
 *   2. Each allocation's amount must not exceed the AR/AP record's current balance_amount
 *   3. balance_amount cannot go below 0
 *   4. paid_amount + balance_amount === original_amount
 *   5. AR/AP status updated: partial if balance > 0, paid if balance = 0
 *   6. Cash/Bank transaction posted if account is linked
 */
export async function postPaymentWithAllocations(
  session: UserSessionPayload | null,
  paymentId: number,
  allocationInputs: Array<{ receivable_id?: number | null; payable_id?: number | null; allocated_amount: number }>
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const userId = sessionUserId(session);

  // Load payment
  const payment = await queryOne<Payment>(
    "SELECT * FROM payments WHERE id = ?",
    [paymentId]
  );
  if (!payment) throw new Error("Pembayaran tidak ditemukan.");
  assertEntityCompanyAccess(session, payment.company_id);

  if (payment.status === "posted") throw new Error("Pembayaran sudah diposting sebelumnya.");
  if (payment.status === "cancelled") throw new Error("Pembayaran yang dibatalkan tidak dapat diposting.");

  if (allocationInputs.length === 0) throw new Error("Minimal satu alokasi diperlukan untuk posting.");

  const totalAllocating = allocationInputs.reduce((s, a) => s + a.allocated_amount, 0);
  const paymentAmount = Number(payment.amount);
  if (Math.abs(totalAllocating - paymentAmount) > 0.01) {
    throw new Error(
      `Total alokasi (${totalAllocating.toFixed(2)}) tidak sama dengan jumlah pembayaran (${paymentAmount.toFixed(2)}).`
    );
  }

  await transaction(async (conn) => {
    // 1. Mark payment as posted
    await conn.execute("UPDATE payments SET status = 'posted' WHERE id = ?", [paymentId]);

    // 2. Process each allocation
    for (const alloc of allocationInputs) {
      const allocAmt = Number(alloc.allocated_amount);

      if (alloc.receivable_id) {
        // Lock the receivable row
        const [arRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
          "SELECT * FROM receivables WHERE id = ? FOR UPDATE",
          [alloc.receivable_id]
        );
        if (!arRows.length) throw new Error(`Receivable #${alloc.receivable_id} tidak ditemukan.`);
        const ar = arRows[0];

        if (ar.company_id !== payment.company_id) {
          throw new Error(`Receivable #${alloc.receivable_id} bukan milik perusahaan yang sama.`);
        }
        const currentBalance = Number(ar.balance_amount);
        if (allocAmt > currentBalance + 0.001) {
          throw new Error(
            `Alokasi (${allocAmt.toFixed(2)}) melebihi saldo outstanding piutang (${currentBalance.toFixed(2)}).`
          );
        }

        const newPaid    = Number(ar.paid_amount) + allocAmt;
        const newBalance = Number(ar.original_amount) - newPaid;
        if (newBalance < -0.001) throw new Error("Saldo piutang tidak boleh negatif.");

        const newStatus = newBalance <= 0.001 ? "paid" : "partial";

        await conn.execute(
          "UPDATE receivables SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?",
          [newPaid.toFixed(2), Math.max(0, newBalance).toFixed(2), newStatus, alloc.receivable_id]
        );

        await conn.execute(
          "INSERT INTO payment_allocations (payment_id, receivable_id, allocated_amount) VALUES (?, ?, ?)",
          [paymentId, alloc.receivable_id, allocAmt.toFixed(2)]
        );

      } else if (alloc.payable_id) {
        // Lock the payable row
        const [apRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
          "SELECT * FROM payables WHERE id = ? FOR UPDATE",
          [alloc.payable_id]
        );
        if (!apRows.length) throw new Error(`Payable #${alloc.payable_id} tidak ditemukan.`);
        const ap = apRows[0];

        if (ap.company_id !== payment.company_id) {
          throw new Error(`Payable #${alloc.payable_id} bukan milik perusahaan yang sama.`);
        }
        const currentBalance = Number(ap.balance_amount);
        if (allocAmt > currentBalance + 0.001) {
          throw new Error(
            `Alokasi (${allocAmt.toFixed(2)}) melebihi saldo outstanding utang (${currentBalance.toFixed(2)}).`
          );
        }

        const newPaid    = Number(ap.paid_amount) + allocAmt;
        const newBalance = Number(ap.original_amount) - newPaid;
        if (newBalance < -0.001) throw new Error("Saldo utang tidak boleh negatif.");

        const newStatus = newBalance <= 0.001 ? "paid" : "partial";

        await conn.execute(
          "UPDATE payables SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?",
          [newPaid.toFixed(2), Math.max(0, newBalance).toFixed(2), newStatus, alloc.payable_id]
        );

        await conn.execute(
          "INSERT INTO payment_allocations (payment_id, payable_id, allocated_amount) VALUES (?, ?, ?)",
          [paymentId, alloc.payable_id, allocAmt.toFixed(2)]
        );

      } else {
        throw new Error("Setiap alokasi harus merujuk ke receivable_id atau payable_id.");
      }
    }

    // 3. Create cash/bank transaction for the posting
    if (payment.cash_account_id) {
      const txType = payment.payment_type === "customer_receipt" ? "in" : "out";
      await conn.execute(
        `INSERT INTO cash_transactions
           (company_id, cash_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'payment', ?, ?, 'posted', ?)`,
        [
          payment.company_id, payment.cash_account_id, txType,
          payment.payment_date, payment.amount,
          paymentId,
          `Pembayaran ${payment.payment_no}`,
          userId,
        ]
      );
    } else if (payment.bank_account_id) {
      const txType = payment.payment_type === "customer_receipt" ? "in" : "out";
      await conn.execute(
        `INSERT INTO bank_transactions
           (company_id, bank_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'payment', ?, ?, 'posted', ?)`,
        [
          payment.company_id, payment.bank_account_id, txType,
          payment.payment_date, payment.amount,
          paymentId,
          `Pembayaran ${payment.payment_no}`,
          userId,
        ]
      );
    }
  });

  await logAudit({
    user_id: userId, company_id: payment.company_id,
    action: "POST", module: "payments", entity: "payments", entity_id: paymentId,
    new_values: { status: "posted", allocations: allocationInputs },
  });
}

export async function getPaymentAllocations(
  session: UserSessionPayload | null,
  paymentId: number
): Promise<PaymentAllocation[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const payment = await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [paymentId]);
  if (!payment) throw new Error("Pembayaran tidak ditemukan.");
  assertEntityCompanyAccess(session, payment.company_id);

  return query<PaymentAllocation[]>(
    "SELECT * FROM payment_allocations WHERE payment_id = ?",
    [paymentId]
  );
}
