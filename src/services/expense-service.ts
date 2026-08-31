/**
 * ERP Manajemen — Expense & Expense Approval Service
 *
 * Workflow:
 *   draft → submitted → approved / rejected → paid
 *
 * Rules:
 * - An unapproved expense MUST NOT be paid.
 * - Paying an expense atomically records a cash or bank OUT transaction.
 * - Invariant: Paid expenses cannot be hard-deleted.
 */

import { z } from "zod";
import { query, queryOne, execute, transaction } from "@/lib/db";
import { Expense, ExpenseCategory, ExpenseStatus } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import {
  resolveCompanyScope,
  assertEntityCompanyAccess,
} from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult, PaginationParams } from "@/types/pagination";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ExpenseCategorySchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(150),
  account_id: z.number().int().positive().optional().nullable(),
});

export type ExpenseCategoryInput = z.infer<typeof ExpenseCategorySchema>;

export const ExpenseSchema = z.object({
  category_id: z.number().int().positive("Kategori biaya wajib dipilih"),
  branch_id: z.number().int().positive().optional().nullable(),
  expense_no: z.string().min(3).max(50),
  expense_date: z.string().min(1), // "YYYY-MM-DD"
  description: z.string().min(3).max(255),
  amount: z.number().positive("Nominal biaya harus lebih dari 0"),
});

export type ExpenseInput = z.infer<typeof ExpenseSchema>;

export const ExpensePaymentSchema = z.object({
  payment_method: z.enum(["cash", "bank"]),
  account_id: z.number().int().positive("Akun kas/bank wajib dipilih"),
  payment_date: z.string().optional(),
});

export type ExpensePaymentInput = z.infer<typeof ExpensePaymentSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertExpenseAccess(
  session: UserSessionPayload | null,
  expenseId: number
): Promise<Expense> {
  const expense = await queryOne<Expense>(
    `SELECT e.*, ec.name AS category_name, ec.code AS category_code,
            b.name AS branch_name, u1.name AS requested_by_name, u2.name AS approved_by_name
     FROM expenses e
     JOIN expense_categories ec ON e.category_id = ec.id
     LEFT JOIN branches b ON e.branch_id = b.id
     LEFT JOIN users u1 ON e.requested_by = u1.id
     LEFT JOIN users u2 ON e.approved_by = u2.id
     WHERE e.id = ?`,
    [expenseId]
  );
  if (!expense) throw new Error("Pengajuan biaya (Expense) tidak ditemukan.");
  assertEntityCompanyAccess(session, expense.company_id);
  return expense;
}

// ─── Category Functions ───────────────────────────────────────────────────────

export async function listExpenseCategories(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<ExpenseCategory[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<ExpenseCategory[]>(
    "SELECT * FROM expense_categories WHERE company_id = ? ORDER BY code ASC",
    [companyId]
  );
}

export async function createExpenseCategory(
  session: UserSessionPayload | null,
  input: ExpenseCategoryInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; code: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = ExpenseCategorySchema.parse(input);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM expense_categories WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) throw new Error(`Kode kategori biaya '${validated.code}' sudah digunakan.`);

  const res = await execute(
    "INSERT INTO expense_categories (company_id, code, name, account_id) VALUES (?, ?, ?, ?)",
    [companyId, validated.code, validated.name, validated.account_id ?? null]
  );

  return { id: res.insertId, code: validated.code };
}

// ─── Expense Lifecycle Functions ──────────────────────────────────────────────

/**
 * Create a new Expense in DRAFT status.
 */
export async function createExpense(
  session: UserSessionPayload | null,
  input: ExpenseInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; expense_no: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = ExpenseSchema.parse(input);
  const userId = sessionUserId(session);

  // Check duplicate expense_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM expenses WHERE company_id = ? AND expense_no = ? LIMIT 1",
    [companyId, validated.expense_no]
  );
  if (existing) throw new Error(`Nomor Biaya '${validated.expense_no}' sudah digunakan.`);

  // Verify category belongs to company
  const category = await queryOne<{ id: number }>(
    "SELECT id FROM expense_categories WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.category_id, companyId]
  );
  if (!category) throw new Error("Kategori biaya tidak valid untuk perusahaan ini.");

  const res = await execute(
    `INSERT INTO expenses
       (company_id, branch_id, category_id, expense_no, expense_date, description, amount, status, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      companyId,
      validated.branch_id ?? null,
      validated.category_id,
      validated.expense_no,
      validated.expense_date,
      validated.description,
      validated.amount.toFixed(2),
      userId,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "expenses",
    entity: "expenses",
    entity_id: res.insertId,
    new_values: { ...validated, status: "draft" },
  });

  return { id: res.insertId, expense_no: validated.expense_no };
}

/**
 * Submit Expense: draft → submitted
 */
export async function submitExpense(
  session: UserSessionPayload | null,
  expenseId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const exp = await assertExpenseAccess(session, expenseId);
  if (exp.status !== "draft") {
    throw new Error(`Hanya draft biaya yang dapat diajukan (status: '${exp.status}').`);
  }

  await execute("UPDATE expenses SET status = 'submitted' WHERE id = ?", [expenseId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: exp.company_id,
    action: "SUBMIT",
    module: "expenses",
    entity: "expenses",
    entity_id: expenseId,
    new_values: { status: "submitted" },
  });
}

/**
 * Approve Expense: submitted → approved (requires FINANCE_MANAGE)
 */
export async function approveExpense(
  session: UserSessionPayload | null,
  expenseId: number,
  notes?: string
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const exp = await assertExpenseAccess(session, expenseId);
  const userId = sessionUserId(session);

  if (exp.status !== "submitted" && exp.status !== "draft") {
    throw new Error(`Pengajuan biaya dengan status '${exp.status}' tidak dapat disetujui.`);
  }

  await transaction(async (conn) => {
    // 1. Update expense
    await conn.execute(
      "UPDATE expenses SET status = 'approved', approved_by = ? WHERE id = ?",
      [userId, expenseId]
    );

    // 2. Record in expense_approvals
    await conn.execute(
      `INSERT INTO expense_approvals (expense_id, approver_user_id, decision, notes, decided_at)
       VALUES (?, ?, 'approved', ?, NOW())`,
      [expenseId, userId, notes ?? null]
    );
  });

  await logAudit({
    user_id: userId,
    company_id: exp.company_id,
    action: "APPROVE",
    module: "expenses",
    entity: "expenses",
    entity_id: expenseId,
    new_values: { status: "approved" },
  });
}

/**
 * Reject Expense: submitted → rejected
 */
export async function rejectExpense(
  session: UserSessionPayload | null,
  expenseId: number,
  notes?: string
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const exp = await assertExpenseAccess(session, expenseId);
  const userId = sessionUserId(session);

  if (exp.status !== "submitted" && exp.status !== "draft") {
    throw new Error(`Pengajuan biaya dengan status '${exp.status}' tidak dapat ditolak.`);
  }

  await transaction(async (conn) => {
    await conn.execute("UPDATE expenses SET status = 'rejected' WHERE id = ?", [expenseId]);
    await conn.execute(
      `INSERT INTO expense_approvals (expense_id, approver_user_id, decision, notes, decided_at)
       VALUES (?, ?, 'rejected', ?, NOW())`,
      [expenseId, userId, notes ?? null]
    );
  });

  await logAudit({
    user_id: userId,
    company_id: exp.company_id,
    action: "REJECT",
    module: "expenses",
    entity: "expenses",
    entity_id: expenseId,
    new_values: { status: "rejected", notes },
  });
}

/**
 * Pay Expense: approved → paid (atomically creates Cash/Bank OUT transaction)
 * An unapproved expense MUST NOT be paid.
 */
export async function payExpense(
  session: UserSessionPayload | null,
  expenseId: number,
  input: ExpensePaymentInput
): Promise<{ transaction_id: number }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const exp = await assertExpenseAccess(session, expenseId);
  const validated = ExpensePaymentSchema.parse(input);
  const userId = sessionUserId(session);

  // Invariant check: expense MUST be approved before payment
  if (exp.status !== "approved") {
    throw new Error(`Biaya belum disetujui (status saat ini: '${exp.status}'). Pembayaran hanya dapat dilakukan untuk biaya berstatus 'approved'.`);
  }

  const amount = Number(exp.amount);

  const result = await transaction(async (conn) => {
    // 1. Update expense status to paid
    await conn.execute("UPDATE expenses SET status = 'paid' WHERE id = ?", [expenseId]);

    // 2. Insert cash or bank outflow transaction
    let txId = 0;
    if (validated.payment_method === "cash") {
      const [cRes] = await conn.execute<import("mysql2").ResultSetHeader>(
        `INSERT INTO cash_transactions
           (company_id, cash_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
         VALUES (?, ?, 'out', COALESCE(?, NOW()), ?, 'expense', ?, ?, 'posted', ?)`,
        [
          exp.company_id,
          validated.account_id,
          validated.payment_date ?? null,
          amount.toFixed(2),
          expenseId,
          `Pembayaran biaya ${exp.expense_no}: ${exp.description}`,
          userId,
        ]
      );
      txId = cRes.insertId;
    } else {
      const [bRes] = await conn.execute<import("mysql2").ResultSetHeader>(
        `INSERT INTO bank_transactions
           (company_id, bank_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
         VALUES (?, ?, 'out', COALESCE(?, NOW()), ?, 'expense', ?, ?, 'posted', ?)`,
        [
          exp.company_id,
          validated.account_id,
          validated.payment_date ?? null,
          amount.toFixed(2),
          expenseId,
          `Pembayaran biaya ${exp.expense_no}: ${exp.description}`,
          userId,
        ]
      );
      txId = bRes.insertId;
    }

    return { transaction_id: txId };
  });

  await logAudit({
    user_id: userId,
    company_id: exp.company_id,
    action: "PAY",
    module: "expenses",
    entity: "expenses",
    entity_id: expenseId,
    new_values: { status: "paid", payment_method: validated.payment_method, account_id: validated.account_id },
  });

  return result;
}

/**
 * List Expenses with pagination and filters.
 */
export async function listExpenses(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: ExpenseStatus | "all";
    categoryId?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Expense>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, categoryId, search, dateFrom, dateTo } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["e.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("e.status = ?"); qp.push(status); }
  if (categoryId) { conditions.push("e.category_id = ?"); qp.push(categoryId); }
  if (search) {
    conditions.push("(e.expense_no LIKE ? OR e.description LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) { conditions.push("e.expense_date >= ?"); qp.push(dateFrom); }
  if (dateTo) { conditions.push("e.expense_date <= ?"); qp.push(dateTo); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM expenses e WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Expense[]>(
    `SELECT e.*, ec.name AS category_name, ec.code AS category_code,
            b.name AS branch_name, u1.name AS requested_by_name, u2.name AS approved_by_name
     FROM expenses e
     JOIN expense_categories ec ON e.category_id = ec.id
     LEFT JOIN branches b ON e.branch_id = b.id
     LEFT JOIN users u1 ON e.requested_by = u1.id
     LEFT JOIN users u2 ON e.approved_by = u2.id
     WHERE ${where}
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Expense by ID.
 */
export async function getExpenseById(
  session: UserSessionPayload | null,
  expenseId: number
): Promise<Expense | null> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  return assertExpenseAccess(session, expenseId);
}

/**
 * Delete Expense (Invariant: Paid/posted expenses CANNOT be deleted).
 */
export async function deleteExpense(
  session: UserSessionPayload | null,
  expenseId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const exp = await assertExpenseAccess(session, expenseId);

  if (exp.status === "paid") {
    throw new Error("Biaya yang sudah dibayar (paid) tidak boleh dihapus (Invariant: Immutable Financial Records).");
  }

  await execute("DELETE FROM expenses WHERE id = ?", [expenseId]);
}
