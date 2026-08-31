/**
 * ERP Manajemen — Bank Accounts & Bank Transactions Service
 *
 * Rules:
 * - Scoped by company_id
 * - Financial transactions have status: draft → posted → cancelled
 * - Invariant: Posted transactions cannot be deleted.
 */

import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { BankAccount, BankTransaction, CashTransactionType, FinancialTxStatus } from "@/types";
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

export const BankAccountSchema = z.object({
  code: z.string().min(2).max(40),
  bank_name: z.string().min(2).max(100),
  account_number: z.string().max(100).optional().nullable(),
  account_name: z.string().max(150).optional().nullable(),
  currency_code: z.string().length(3).default("IDR"),
  opening_balance: z.number().min(0).default(0),
});

export type BankAccountInput = z.infer<typeof BankAccountSchema>;

export const BankTransactionSchema = z.object({
  bank_account_id: z.number().int().positive("Akun bank wajib dipilih"),
  transaction_type: z.enum(["in", "out", "transfer"]),
  amount: z.number().positive("Nominal harus lebih dari 0"),
  transaction_date: z.string().optional(),
  description: z.string().max(255).optional().nullable(),
  reference_type: z.string().max(50).optional().nullable(),
  reference_id: z.number().int().positive().optional().nullable(),
});

export type BankTransactionInput = z.infer<typeof BankTransactionSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Account Functions ────────────────────────────────────────────────────────

export async function listBankAccounts(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<BankAccount[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<BankAccount[]>(
    `SELECT ba.*,
       (ba.opening_balance +
        COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = ba.id AND transaction_type = 'in' AND status = 'posted'), 0) -
        COALESCE((SELECT SUM(amount) FROM bank_transactions WHERE bank_account_id = ba.id AND transaction_type = 'out' AND status = 'posted'), 0)
       ) AS current_balance
     FROM bank_accounts ba
     WHERE ba.company_id = ?
     ORDER BY ba.code ASC`,
    [companyId]
  );
}

export async function createBankAccount(
  session: UserSessionPayload | null,
  input: BankAccountInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; code: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = BankAccountSchema.parse(input);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM bank_accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) throw new Error(`Kode rekening bank '${validated.code}' sudah digunakan.`);

  const res = await execute(
    `INSERT INTO bank_accounts (company_id, code, bank_name, account_number, account_name, currency_code, opening_balance, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      companyId,
      validated.code,
      validated.bank_name,
      validated.account_number ?? null,
      validated.account_name ?? null,
      validated.currency_code,
      validated.opening_balance.toFixed(2),
    ]
  );

  await logAudit({
    user_id: sessionUserId(session),
    company_id: companyId,
    action: "CREATE",
    module: "finance",
    entity: "bank_accounts",
    entity_id: res.insertId,
    new_values: { ...validated, status: "active" },
  });

  return { id: res.insertId, code: validated.code };
}

// ─── Transaction Functions ────────────────────────────────────────────────────

export async function recordBankTransaction(
  session: UserSessionPayload | null,
  input: BankTransactionInput,
  postImmediately = true,
  requestedCompanyId?: number | string | null
): Promise<{ id: number }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = BankTransactionSchema.parse(input);
  const userId = sessionUserId(session);

  // Verify account belongs to company
  const account = await queryOne<BankAccount>(
    "SELECT * FROM bank_accounts WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.bank_account_id, companyId]
  );
  if (!account) throw new Error("Rekening bank tidak ditemukan atau tidak aktif.");

  const status: FinancialTxStatus = postImmediately ? "posted" : "draft";

  const res = await execute(
    `INSERT INTO bank_transactions
       (company_id, bank_account_id, transaction_type, transaction_date, amount, reference_type, reference_id, description, status, created_by)
     VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.bank_account_id,
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
    entity: "bank_transactions",
    entity_id: res.insertId,
    new_values: { ...validated, status },
  });

  return { id: res.insertId };
}

export async function listBankTransactions(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    accountId?: number;
    transactionType?: CashTransactionType;
    status?: FinancialTxStatus | "all";
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<BankTransaction>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, accountId, transactionType, status } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["bt.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (accountId) { conditions.push("bt.bank_account_id = ?"); qp.push(accountId); }
  if (transactionType) { conditions.push("bt.transaction_type = ?"); qp.push(transactionType); }
  if (status && status !== "all") { conditions.push("bt.status = ?"); qp.push(status); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM bank_transactions bt WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<BankTransaction[]>(
    `SELECT bt.*, ba.bank_name, ba.account_number, ba.account_name
     FROM bank_transactions bt
     JOIN bank_accounts ba ON bt.bank_account_id = ba.id
     WHERE ${where}
     ORDER BY bt.transaction_date DESC, bt.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function deleteBankTransaction(
  session: UserSessionPayload | null,
  transactionId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const tx = await queryOne<BankTransaction>(
    "SELECT * FROM bank_transactions WHERE id = ?",
    [transactionId]
  );
  if (!tx) throw new Error("Transaksi bank tidak ditemukan.");
  assertEntityCompanyAccess(session, tx.company_id);

  if (tx.status === "posted") {
    throw new Error("Transaksi keuangan yang sudah diposting tidak boleh dihapus (Invariant: Immutable Posted Transactions).");
  }

  await execute("DELETE FROM bank_transactions WHERE id = ?", [transactionId]);
}
