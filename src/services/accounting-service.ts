/**
 * ERP Manajemen — Central Accounting Engine Service (Phase 11)
 *
 * Architecture:
 *   Source Transaction
 *          ↓
 *   Accounting Service
 *          ↓
 *   Build Journal
 *          ↓
 *   Validate (SUM(Debit) == SUM(Credit))
 *          ↓
 *   Financial Period Check (Must NOT be CLOSED)
 *          ↓
 *   Database Transaction
 *          ↓
 *   Post Journal & Items
 *          ↓
 *   Post General Ledger
 *          ↓
 *   Audit Trail
 *
 * Core Invariants:
 *   - SUM(DEBIT) = SUM(CREDIT) strictly enforced. Unbalanced journal is REJECTED.
 *   - Posted journal entries are IMMUTABLE and cannot be hard-deleted.
 *   - CLOSED financial period rejects posting.
 *   - Corrections must be executed through Reversal / Adjusting Journal.
 *   - Trial Balance must balance (Total Debit == Total Credit).
 *   - Source transaction traceability preserved via source_type and source_id.
 */

import { z } from "zod";
import { query, queryOne, execute, transaction } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult } from "@/types/pagination";
import {
  Account,
  AccountType,
  FinancialPeriod,
  JournalEntry,
  JournalEntryItem,
  GeneralLedgerEntry,
  TrialBalanceReport,
  TrialBalanceRow,
} from "@/types";

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const AccountSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  account_type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  normal_balance: z.enum(["debit", "credit"]),
  parent_id: z.number().int().positive().optional().nullable(),
  is_control_account: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type AccountInput = z.infer<typeof AccountSchema>;

export const FinancialPeriodSchema = z.object({
  period_year: z.number().int().min(2000).max(2100),
  period_month: z.number().int().min(1).max(12),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  status: z.enum(["open", "closed"]).default("open"),
});

export type FinancialPeriodInput = z.infer<typeof FinancialPeriodSchema>;

export const JournalItemInputSchema = z.object({
  account_id: z.number().int().positive("Akun wajib dipilih"),
  description: z.string().max(255).optional().nullable(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
});

export const JournalEntryInputSchema = z.object({
  journal_no: z.string().min(3).max(50),
  journal_date: z.string().min(1),
  description: z.string().max(255).optional().nullable(),
  source_type: z.string().max(50).optional().nullable(),
  source_id: z.number().int().positive().optional().nullable(),
  items: z.array(JournalItemInputSchema).min(2, "Jurnal harus memiliki minimal 2 baris (Debit & Credit)"),
});

export type JournalEntryInput = z.infer<typeof JournalEntryInputSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Chart of Accounts (COA) ──────────────────────────────────────────────────

export async function listAccounts(
  session: UserSessionPayload | null,
  params?: { account_type?: AccountType; status?: string; search?: string },
  requestedCompanyId?: number | string | null
): Promise<Account[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const conditions: string[] = ["company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (params?.account_type) {
    conditions.push("account_type = ?");
    qp.push(params.account_type);
  }
  if (params?.status && params.status !== "all") {
    conditions.push("status = ?");
    qp.push(params.status);
  }
  if (params?.search) {
    conditions.push("(code LIKE ? OR name LIKE ?)");
    qp.push(`%${params.search}%`, `%${params.search}%`);
  }

  return query<Account[]>(
    `SELECT * FROM accounts WHERE ${conditions.join(" AND ")} ORDER BY code ASC`,
    qp
  );
}

export async function getAccountByCode(
  session: UserSessionPayload | null,
  code: string,
  requestedCompanyId?: number | string | null
): Promise<Account | null> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return queryOne<Account>(
    "SELECT * FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, code]
  );
}

export async function createAccount(
  session: UserSessionPayload | null,
  input: AccountInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; code: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = AccountSchema.parse(input);
  const userId = sessionUserId(session);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) {
    throw new Error(`Kode akun '${validated.code}' sudah digunakan di perusahaan ini.`);
  }

  const res = await execute(
    `INSERT INTO accounts
       (company_id, parent_id, code, name, account_type, normal_balance, is_control_account, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.parent_id ?? null,
      validated.code,
      validated.name,
      validated.account_type,
      validated.normal_balance,
      validated.is_control_account ? 1 : 0,
      validated.status,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "accounting",
    entity: "accounts",
    entity_id: res.insertId,
    new_values: { ...validated },
  });

  return { id: res.insertId, code: validated.code };
}

// ─── Financial Periods ────────────────────────────────────────────────────────

export async function listFinancialPeriods(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<FinancialPeriod[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<FinancialPeriod[]>(
    "SELECT * FROM financial_periods WHERE company_id = ? ORDER BY period_year DESC, period_month DESC",
    [companyId]
  );
}

export async function createFinancialPeriod(
  session: UserSessionPayload | null,
  input: FinancialPeriodInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = FinancialPeriodSchema.parse(input);
  const userId = sessionUserId(session);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM financial_periods WHERE company_id = ? AND period_year = ? AND period_month = ? LIMIT 1",
    [companyId, validated.period_year, validated.period_month]
  );
  if (existing) {
    throw new Error(`Periode ${validated.period_year}-${validated.period_month} sudah terdaftar.`);
  }

  const res = await execute(
    `INSERT INTO financial_periods (company_id, period_year, period_month, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.period_year,
      validated.period_month,
      validated.start_date,
      validated.end_date,
      validated.status,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "accounting",
    entity: "financial_periods",
    entity_id: res.insertId,
    new_values: { ...validated },
  });

  return { id: res.insertId };
}

export async function closeFinancialPeriod(
  session: UserSessionPayload | null,
  periodId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const userId = sessionUserId(session);

  const period = await queryOne<FinancialPeriod>(
    "SELECT * FROM financial_periods WHERE id = ?",
    [periodId]
  );
  if (!period) throw new Error("Periode finansial tidak ditemukan.");
  assertEntityCompanyAccess(session, period.company_id);

  await execute("UPDATE financial_periods SET status = 'closed' WHERE id = ?", [periodId]);

  await logAudit({
    user_id: userId,
    company_id: period.company_id,
    action: "CLOSE_PERIOD",
    module: "accounting",
    entity: "financial_periods",
    entity_id: periodId,
    new_values: { status: "closed" },
  });
}

export async function reopenFinancialPeriod(
  session: UserSessionPayload | null,
  periodId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const userId = sessionUserId(session);

  const period = await queryOne<FinancialPeriod>(
    "SELECT * FROM financial_periods WHERE id = ?",
    [periodId]
  );
  if (!period) throw new Error("Periode finansial tidak ditemukan.");
  assertEntityCompanyAccess(session, period.company_id);

  await execute("UPDATE financial_periods SET status = 'open' WHERE id = ?", [periodId]);

  await logAudit({
    user_id: userId,
    company_id: period.company_id,
    action: "REOPEN_PERIOD",
    module: "accounting",
    entity: "financial_periods",
    entity_id: periodId,
    new_values: { status: "open" },
  });
}

/**
 * Validates that the financial period for a given date is OPEN.
 * Automatically creates an open period if none exists yet for that month.
 */
export async function assertOpenPeriodForDate(
  companyId: number,
  journalDate: string
): Promise<number | null> {
  const d = new Date(journalDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const existingPeriod = await queryOne<FinancialPeriod>(
    "SELECT * FROM financial_periods WHERE company_id = ? AND period_year = ? AND period_month = ? LIMIT 1",
    [companyId, year, month]
  );

  if (existingPeriod) {
    if (existingPeriod.status === "closed") {
      throw new Error(
        `Periode akuntansi untuk tanggal ${journalDate} (${year}-${String(month).padStart(2, "0")}) sudah DITUTUP (CLOSED). Tidak dapat memposting jurnal.`
      );
    }
    return existingPeriod.id;
  }

  // Create an open period automatically for this month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const res = await execute(
    `INSERT INTO financial_periods (company_id, period_year, period_month, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, 'open')`,
    [companyId, year, month, startDate, endDate]
  );
  return res.insertId;
}

// ─── Journal Entry Engine ─────────────────────────────────────────────────────

/**
 * Validates and posts a Journal Entry atomically:
 *   1. SUM(debit) === SUM(credit)
 *   2. Period is OPEN
 *   3. All accounts belong to the target company
 *   4. Inserts journal_entries, journal_entry_items, and general_ledger records
 */
export async function postJournalEntry(
  session: UserSessionPayload | null,
  input: JournalEntryInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = JournalEntryInputSchema.parse(input);
  const userId = sessionUserId(session);

  // 1. INVARIANT CHECK: SUM(debit) == SUM(credit)
  let totalDebit = 0;
  let totalCredit = 0;
  for (const it of validated.items) {
    totalDebit += it.debit;
    totalCredit += it.credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Jurnal TIDAK BALANCE! SUM(Debit) = ${totalDebit.toFixed(2)} ≠ SUM(Credit) = ${totalCredit.toFixed(2)}. Invariant dilanggar: Posting ditolak.`
    );
  }

  if (totalDebit <= 0) {
    throw new Error("Total nilai transaksi jurnal harus lebih dari 0.");
  }

  // 2. PERIOD CHECK
  const periodId = await assertOpenPeriodForDate(companyId, validated.journal_date);

  // 3. ACCOUNT VERIFICATION
  const accountIds = Array.from(new Set(validated.items.map((i) => i.account_id)));
  const acctRows = await query<{ id: number; company_id: number; status: string }[]>(
    `SELECT id, company_id, status FROM accounts WHERE id IN (${accountIds.map(() => "?").join(",")})`,
    accountIds
  );

  if (acctRows.length !== accountIds.length) {
    throw new Error("Beberapa akun yang dipilih tidak ditemukan dalam Chart of Accounts.");
  }
  for (const acct of acctRows) {
    if (acct.company_id !== companyId) {
      throw new Error(`Akun ID ${acct.id} bukan milik perusahaan aktif.`);
    }
    if (acct.status !== "active") {
      throw new Error(`Akun ID ${acct.id} dalam status non-aktif.`);
    }
  }

  // Check unique journal_no
  const existingNo = await queryOne<{ id: number }>(
    "SELECT id FROM journal_entries WHERE company_id = ? AND journal_no = ? LIMIT 1",
    [companyId, validated.journal_no]
  );
  if (existingNo) {
    throw new Error(`Nomor jurnal '${validated.journal_no}' sudah digunakan.`);
  }

  let createdJournalId = 0;

  // 4. ATOMIC DATABASE POSTING
  await transaction(async (conn) => {
    // a. Insert Journal Entry Header
    const [journalResult] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries
         (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, created_by, posted_by, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, NOW())`,
      [
        companyId,
        periodId,
        validated.journal_no,
        validated.journal_date,
        validated.source_type ?? null,
        validated.source_id ?? null,
        validated.description ?? null,
        userId,
        userId,
      ]
    );

    createdJournalId = journalResult.insertId;

    // b. Insert Items & General Ledger
    for (const item of validated.items) {
      const [itemResult] = await conn.execute<import("mysql2").ResultSetHeader>(
        `INSERT INTO journal_entry_items
           (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?)`,
        [
          createdJournalId,
          item.account_id,
          item.description ?? validated.description ?? null,
          item.debit.toFixed(2),
          item.credit.toFixed(2),
        ]
      );

      const itemId = itemResult.insertId;

      // Post to General Ledger
      await conn.execute(
        `INSERT INTO general_ledger
           (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          createdJournalId,
          itemId,
          item.account_id,
          validated.journal_date,
          item.debit.toFixed(2),
          item.credit.toFixed(2),
        ]
      );
    }
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "POST_JOURNAL",
    module: "accounting",
    entity: "journal_entries",
    entity_id: createdJournalId,
    new_values: {
      journal_no: validated.journal_no,
      total: totalDebit,
      item_count: validated.items.length,
    },
  });

  return { id: createdJournalId, journal_no: validated.journal_no };
}

/**
 * Reversal Engine:
 * Creates an exact opposite journal entry (Debit ↔ Credit swapped)
 * Marks original journal as 'reversed'
 */
export async function reverseJournalEntry(
  session: UserSessionPayload | null,
  journalId: number,
  reversalReason?: string
): Promise<{ reversalJournalId: number; reversalJournalNo: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const userId = sessionUserId(session);

  const originalJournal = await queryOne<JournalEntry>(
    "SELECT * FROM journal_entries WHERE id = ?",
    [journalId]
  );
  if (!originalJournal) throw new Error("Jurnal tidak ditemukan.");
  assertEntityCompanyAccess(session, originalJournal.company_id);

  if (originalJournal.status !== "posted") {
    throw new Error(`Hanya jurnal berstatus 'posted' yang dapat dibalik (status saat ini: '${originalJournal.status}').`);
  }

  // Load original items
  const items = await query<JournalEntryItem[]>(
    "SELECT * FROM journal_entry_items WHERE journal_entry_id = ?",
    [journalId]
  );
  if (items.length === 0) throw new Error("Item jurnal asli tidak ditemukan.");

  const periodId = await assertOpenPeriodForDate(
    originalJournal.company_id,
    new Date().toISOString().split("T")[0]
  );

  const reversalNo = `REV-${originalJournal.journal_no}-${Date.now().toString().slice(-4)}`;
  const currentDate = new Date().toISOString().split("T")[0];
  let reversalJournalId = 0;

  await transaction(async (conn) => {
    // 1. Mark original journal as reversed
    await conn.execute("UPDATE journal_entries SET status = 'reversed' WHERE id = ?", [journalId]);

    // 2. Create reversal journal header
    const [revRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries
         (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, reversal_of_id, created_by, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'reversal', ?, ?, 'posted', ?, ?, ?, NOW())`,
      [
        originalJournal.company_id,
        periodId,
        reversalNo,
        currentDate,
        journalId,
        `Pembalikan Jurnal: ${originalJournal.journal_no}${reversalReason ? ` (${reversalReason})` : ""}`,
        journalId,
        userId,
        userId,
      ]
    );
    reversalJournalId = revRes.insertId;

    // 3. Insert reversed items: swap debit and credit
    for (const item of items) {
      const reversedDebit = Number(item.credit);
      const reversedCredit = Number(item.debit);

      const [revItemRes] = await conn.execute<import("mysql2").ResultSetHeader>(
        `INSERT INTO journal_entry_items
           (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?)`,
        [
          reversalJournalId,
          item.account_id,
          `Pembalikan: ${item.description || originalJournal.journal_no}`,
          reversedDebit.toFixed(2),
          reversedCredit.toFixed(2),
        ]
      );

      const revItemId = revItemRes.insertId;

      // Post to General Ledger
      await conn.execute(
        `INSERT INTO general_ledger
           (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          originalJournal.company_id,
          reversalJournalId,
          revItemId,
          item.account_id,
          currentDate,
          reversedDebit.toFixed(2),
          reversedCredit.toFixed(2),
        ]
      );
    }
  });

  await logAudit({
    user_id: userId,
    company_id: originalJournal.company_id,
    action: "REVERSE_JOURNAL",
    module: "accounting",
    entity: "journal_entries",
    entity_id: journalId,
    new_values: { reversal_id: reversalJournalId, reversal_no: reversalNo },
  });

  return { reversalJournalId, reversalJournalNo: reversalNo };
}

export async function listJournalEntries(
  session: UserSessionPayload | null,
  params?: { page?: number; limit?: number; status?: string; startDate?: string; endDate?: string },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<JournalEntry>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["je.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (params?.status && params.status !== "all") {
    conditions.push("je.status = ?");
    qp.push(params.status);
  }
  if (params?.startDate) {
    conditions.push("je.journal_date >= ?");
    qp.push(params.startDate);
  }
  if (params?.endDate) {
    conditions.push("je.journal_date <= ?");
    qp.push(params.endDate);
  }

  const where = conditions.join(" AND ");
  const countRes = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM journal_entries je WHERE ${where}`,
    qp
  );
  const total = countRes[0]?.total ?? 0;

  const rows = await query<JournalEntry[]>(
    `SELECT je.*,
            COALESCE(SUM(jei.debit), 0) AS total_debit,
            COALESCE(SUM(jei.credit), 0) AS total_credit
     FROM journal_entries je
     LEFT JOIN journal_entry_items jei ON jei.journal_entry_id = je.id
     WHERE ${where}
     GROUP BY je.id
     ORDER BY je.journal_date DESC, je.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getJournalEntryById(
  session: UserSessionPayload | null,
  id: number
): Promise<JournalEntry | null> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const journal = await queryOne<JournalEntry>(
    "SELECT * FROM journal_entries WHERE id = ?",
    [id]
  );
  if (!journal) return null;
  assertEntityCompanyAccess(session, journal.company_id);

  const items = await query<JournalEntryItem[]>(
    `SELECT jei.*, a.code AS account_code, a.name AS account_name, a.account_type, a.normal_balance
     FROM journal_entry_items jei
     JOIN accounts a ON jei.account_id = a.id
     WHERE jei.journal_entry_id = ?
     ORDER BY jei.id ASC`,
    [id]
  );

  journal.items = items;
  return journal;
}

// ─── Automated Journal Creators for Business Modules ──────────────────────────

/**
 * TEST 1: Sales Journal
 * Debit: AR (Account 1200)
 * Credit: Sales Revenue (Account 4000)
 */
export async function createSalesJournal(
  session: UserSessionPayload | null,
  params: {
    invoice_id: number;
    invoice_no: string;
    invoice_date: string;
    total_amount: number;
    customer_name?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const arAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1",
    [companyId]
  );
  const revAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '4000' LIMIT 1",
    [companyId]
  );

  if (!arAcct || !revAcct) {
    throw new Error("Akun Piutang Usaha (1200) atau Pendapatan Penjualan (4000) belum terdaftar.");
  }

  const amt = Number(params.total_amount);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-SALES-${params.invoice_no}`,
      journal_date: params.invoice_date,
      description: `Faktur Penjualan ${params.invoice_no}${params.customer_name ? ` - ${params.customer_name}` : ""}`,
      source_type: "invoice_sales",
      source_id: params.invoice_id,
      items: [
        { account_id: arAcct.id, description: `Piutang Usaha ${params.invoice_no}`, debit: amt, credit: 0 },
        { account_id: revAcct.id, description: `Pendapatan Penjualan ${params.invoice_no}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

/**
 * TEST 2: Customer Payment Journal
 * Debit: Cash/Bank (Account 1100 / 1110)
 * Credit: AR (Account 1200)
 */
export async function createCustomerPaymentJournal(
  session: UserSessionPayload | null,
  params: {
    payment_id: number;
    payment_no: string;
    payment_date: string;
    amount: number;
    is_bank?: boolean;
    reference?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const cashOrBankCode = params.is_bank ? "1110" : "1100";
  const cashAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, cashOrBankCode]
  );
  const arAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1",
    [companyId]
  );

  if (!cashAcct || !arAcct) {
    throw new Error(`Akun Kas/Bank (${cashOrBankCode}) atau Piutang Usaha (1200) belum terdaftar.`);
  }

  const amt = Number(params.amount);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-RECV-${params.payment_no}`,
      journal_date: params.payment_date,
      description: `Penerimaan Pembayaran Pelanggan ${params.payment_no}`,
      source_type: "payment_receipt",
      source_id: params.payment_id,
      items: [
        { account_id: cashAcct.id, description: `Penerimaan Kas/Bank ${params.payment_no}`, debit: amt, credit: 0 },
        { account_id: arAcct.id, description: `Pelunasan Piutang Usaha ${params.payment_no}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

/**
 * TEST 3: Purchase Journal
 * Debit: Inventory (Account 1300) / Expense
 * Credit: AP (Account 2100)
 */
export async function createPurchaseJournal(
  session: UserSessionPayload | null,
  params: {
    invoice_id: number;
    invoice_no: string;
    invoice_date: string;
    total_amount: number;
    supplier_name?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const invAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1300' LIMIT 1",
    [companyId]
  );
  const apAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '2100' LIMIT 1",
    [companyId]
  );

  if (!invAcct || !apAcct) {
    throw new Error("Akun Persediaan (1300) atau Hutang Usaha (2100) belum terdaftar.");
  }

  const amt = Number(params.total_amount);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-PURCH-${params.invoice_no}`,
      journal_date: params.invoice_date,
      description: `Faktur Pembelian ${params.invoice_no}${params.supplier_name ? ` - ${params.supplier_name}` : ""}`,
      source_type: "invoice_purchase",
      source_id: params.invoice_id,
      items: [
        { account_id: invAcct.id, description: `Persediaan Barang ${params.invoice_no}`, debit: amt, credit: 0 },
        { account_id: apAcct.id, description: `Hutang Usaha ${params.invoice_no}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

/**
 * TEST 4: Supplier Payment Journal
 * Debit: AP (Account 2100)
 * Credit: Cash/Bank (Account 1100 / 1110)
 */
export async function createSupplierPaymentJournal(
  session: UserSessionPayload | null,
  params: {
    payment_id: number;
    payment_no: string;
    payment_date: string;
    amount: number;
    is_bank?: boolean;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const apAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '2100' LIMIT 1",
    [companyId]
  );
  const cashOrBankCode = params.is_bank ? "1110" : "1100";
  const cashAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, cashOrBankCode]
  );

  if (!apAcct || !cashAcct) {
    throw new Error(`Akun Hutang Usaha (2100) atau Kas/Bank (${cashOrBankCode}) belum terdaftar.`);
  }

  const amt = Number(params.amount);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-PAY-${params.payment_no}`,
      journal_date: params.payment_date,
      description: `Pembayaran ke Pemasok ${params.payment_no}`,
      source_type: "payment_supplier",
      source_id: params.payment_id,
      items: [
        { account_id: apAcct.id, description: `Pelunasan Hutang Usaha ${params.payment_no}`, debit: amt, credit: 0 },
        { account_id: cashAcct.id, description: `Pengeluaran Kas/Bank ${params.payment_no}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

/**
 * TEST 5: Expense Journal
 * Debit: Operating Expense (e.g. 5000 / 6000)
 * Credit: Cash/Bank (Account 1100 / 1110)
 */
export async function createExpenseJournal(
  session: UserSessionPayload | null,
  params: {
    expense_id: number;
    expense_no: string;
    expense_date: string;
    amount: number;
    expense_account_id?: number;
    is_bank?: boolean;
    description?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  let expAcctId = params.expense_account_id;
  if (!expAcctId) {
    const expAcct = await queryOne<Account>(
      "SELECT id FROM accounts WHERE company_id = ? AND account_type = 'expense' LIMIT 1",
      [companyId]
    );
    if (!expAcct) {
      // Create a default operational expense account
      const r = await execute(
        "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '6000', 'Beban Operasional', 'expense', 'debit', 'active')",
        [companyId]
      );
      expAcctId = r.insertId;
    } else {
      expAcctId = expAcct.id;
    }
  }

  const cashOrBankCode = params.is_bank ? "1110" : "1100";
  const cashAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, cashOrBankCode]
  );
  if (!cashAcct) throw new Error(`Akun Kas/Bank (${cashOrBankCode}) belum terdaftar.`);

  const amt = Number(params.amount);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-EXP-${params.expense_no}`,
      journal_date: params.expense_date,
      description: params.description || `Pengeluaran Biaya ${params.expense_no}`,
      source_type: "expense",
      source_id: params.expense_id,
      items: [
        { account_id: expAcctId, description: `Beban ${params.expense_no}`, debit: amt, credit: 0 },
        { account_id: cashAcct.id, description: `Pengeluaran Kas/Bank ${params.expense_no}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

/**
 * TEST 6: Asset Purchase Journal
 * Debit: Fixed Asset (Account 1400)
 * Credit: Cash / AP (Account 1100 / 2100)
 */
export async function createAssetPurchaseJournal(
  session: UserSessionPayload | null,
  params: {
    asset_id: number;
    asset_code: string;
    acquisition_date: string;
    cost: number;
    is_credit?: boolean; // If credit -> AP (2100), otherwise Cash (1100)
    description?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<{ id: number; journal_no: string }> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const assetAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1400' LIMIT 1",
    [companyId]
  );
  const creditAcctCode = params.is_credit ? "2100" : "1100";
  const creditAcct = await queryOne<Account>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, creditAcctCode]
  );

  if (!assetAcct || !creditAcct) {
    throw new Error(`Akun Aset Tetap (1400) atau Akun Kredit (${creditAcctCode}) belum terdaftar.`);
  }

  const amt = Number(params.cost);
  return postJournalEntry(
    session,
    {
      journal_no: `JV-ASSET-${params.asset_code}`,
      journal_date: params.acquisition_date,
      description: params.description || `Pembelian Aset Tetap ${params.asset_code}`,
      source_type: "fixed_asset",
      source_id: params.asset_id,
      items: [
        { account_id: assetAcct.id, description: `Aset Tetap ${params.asset_code}`, debit: amt, credit: 0 },
        { account_id: creditAcct.id, description: `Kredit ${params.is_credit ? "Hutang Usaha" : "Kas"} ${params.asset_code}`, debit: 0, credit: amt },
      ],
    },
    companyId
  );
}

// ─── General Ledger & Trial Balance Reports ───────────────────────────────────

export async function getGeneralLedgerReport(
  session: UserSessionPayload | null,
  params?: { account_id?: number; startDate?: string; endDate?: string },
  requestedCompanyId?: number | string | null
): Promise<GeneralLedgerEntry[]> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const conditions: string[] = ["gl.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (params?.account_id) {
    conditions.push("gl.account_id = ?");
    qp.push(params.account_id);
  }
  if (params?.startDate) {
    conditions.push("gl.posting_date >= ?");
    qp.push(params.startDate);
  }
  if (params?.endDate) {
    conditions.push("gl.posting_date <= ?");
    qp.push(params.endDate);
  }

  return query<GeneralLedgerEntry[]>(
    `SELECT gl.*, a.code AS account_code, a.name AS account_name,
            je.journal_no, je.description
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     JOIN journal_entries je ON gl.journal_entry_id = je.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY gl.posting_date ASC, gl.id ASC`,
    qp
  );
}

export async function getTrialBalanceReport(
  session: UserSessionPayload | null,
  asOfDate?: string,
  requestedCompanyId?: number | string | null
): Promise<TrialBalanceReport> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  const rows = await query<TrialBalanceRow[]>(
    `SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            a.account_type,
            a.normal_balance,
            COALESCE(SUM(gl.debit), 0) AS debit_total,
            COALESCE(SUM(gl.credit), 0) AS credit_total,
            CASE
              WHEN a.normal_balance = 'debit'  THEN (COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0))
              ELSE (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0))
            END AS ending_balance
     FROM accounts a
     LEFT JOIN general_ledger gl ON gl.account_id = a.id AND gl.posting_date <= ?
     WHERE a.company_id = ? AND a.status = 'active'
     GROUP BY a.id
     ORDER BY a.code ASC`,
    [targetDate, companyId]
  );

  let grandDebit = 0;
  let grandCredit = 0;

  for (const r of rows) {
    grandDebit += Number(r.debit_total);
    grandCredit += Number(r.credit_total);
  }

  const is_balanced = Math.abs(grandDebit - grandCredit) < 0.001;

  return {
    company_id: companyId,
    as_of_date: targetDate,
    rows,
    total_debit: grandDebit,
    total_credit: grandCredit,
    is_balanced,
  };
}
