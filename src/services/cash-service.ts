/**
 * ERP Manajemen — Cash Accounts & Cash Transactions Service
 *
 * Rules:
 * - Scoped by company_id
 * - Financial transactions have status: draft → posted → cancelled
 * - Invariant: Posted transactions cannot be deleted.
 */

import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { CashAccount, CashTransaction, CashTransactionType, FinancialTxStatus } from "@/types";
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

export const CashAccountSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(150),
  currency_code: z.string().length(3).default("IDR"),
  opening_balance: z.number().min(0).default(0),
});

export type CashAccountInput = z.infer<typeof CashAccountSchema>;

export const CashTransactionSchema = z.object({
  cash_account_id: z.number().int().positive("Akun kas wajib dipilih"),
  transaction_type: z.enum(["in", "out", "transfer"]),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  transaction_date: z.string().optional(),
  description: z.string().max(255).optional().nullable(),
  reference_type: z.string().max(50).optional().nullable(),
  reference_id: z.number().int().positive().optional().nullable(),
});

export type CashTransactionInput = z.infer<typeof CashTransactionSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Account Functions ────────────────────────────────────────────────────────

export async function listCashAccounts(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<CashAccount[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<CashAccount[]>(
    `SELECT ca.*,
       (ca.opening_balance +
        COALESCE((SELECT SUM(amount) FROM cash_transactions WHERE cash_account_id = ca.id AND transaction_type = 'in' AND status = 'posted'), 0) -
        COALESCE((SELECT SUM(amount) FROM cash_transactions WHERE cash_account_id = ca.id AND transaction_type = 'out' AND status = 'posted'), 0)
       ) AS current_balance
     FROM cash_accounts ca
     WHERE ca.company_id = ?
     ORDER BY ca.code ASC`,
    [companyId]
  );
}

export async function createCashAccount(
  session: UserSessionPayload | null,
  input: CashAccountInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; code: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = CashAccountSchema.parse(input);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM cash_accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) throw new Error(`Kode akun kas '${validated.code}' sudah digunakan.`);

  const res = await execute(
    `INSERT INTO cash_accounts (company_id, code, name, currency_code, opening_balance, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [companyId, validated.code, validated.name, validated.currency_code, validated.opening_balance.toFixed(2)]
  );

  await logAudit({
    user_id: sessionUserId(session),
    company_id: companyId,
    action: "CREATE",
    module: "finance",
    entity: "cash_accounts",
    entity_id: res.insertId,
    new_values: { ...validated, status: "active" },
  });

  return { id: res.insertId, code: validated.code };
}

// ─── Transaction Functions ────────────────────────────────────────────────────

export async function recordCashTransaction(
  session: UserSessionPayload | null,
  input: CashTransactionInput,
  postImmediately = true,
  requestedCompanyId?: number | string | null
): Promise<{ id: number }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = CashTransactionSchema.parse(input);
  const userId = sessionUserId(session);

  // Verify account belongs to company
  const account = await queryOne<CashAccount>(
    "SELECT * FROM cash_accounts WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.cash_account_id, companyId]
  );
  if (!account) throw new Error("Akun kas tidak ditemukan atau tidak aktif.");

  const status: FinancialTxStatus = postImmediately ? "posted" : "draft";

  const res = await execute(
    `INSERT INTO cash_transactions
       (company_id, cash_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
     VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.cash_account_id,
      validated.transaction_type,
      validated.transaction_date ?? null,
      validated.amount.toFixed(2),
      validated.reference_type ?? null,
      validated.reference_id ?? null,
      validated.description ?? null,
      status,
      userId,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "finance",
    entity: "cash_transactions",
    entity_id: res.insertId,
    new_values: { ...validated, status },
  });

  return { id: res.insertId };
}

export async function listCashTransactions(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    accountId?: number;
    transactionType?: CashTransactionType;
    status?: FinancialTxStatus | "all";
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<CashTransaction>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, accountId, transactionType, status } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["ct.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (accountId) { conditions.push("ct.cash_account_id = ?"); qp.push(accountId); }
  if (transactionType) { conditions.push("ct.transaction_type = ?"); qp.push(transactionType); }
  if (status && status !== "all") { conditions.push("ct.status = ?"); qp.push(status); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM cash_transactions ct WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<CashTransaction[]>(
    `SELECT ct.*, ca.name AS account_name, ca.code AS account_code
     FROM cash_transactions ct
     JOIN cash_accounts ca ON ct.cash_account_id = ca.id
     WHERE ${where}
     ORDER BY ct.transaction_date DESC, ct.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function deleteCashTransaction(
  session: UserSessionPayload | null,
  transactionId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const tx = await queryOne<CashTransaction>(
    "SELECT * FROM cash_transactions WHERE id = ?",
    [transactionId]
  );
  if (!tx) throw new Error("Transaksi kas tidak ditemukan.");
  assertEntityCompanyAccess(session, tx.company_id);

  if (tx.status === "posted") {
    throw new Error("Transaksi keuangan yang sudah diposting tidak boleh dihapus (Invariant: Immutable Posted Transactions).");
  }

  await execute("DELETE FROM cash_transactions WHERE id = ?", [transactionId]);
}
