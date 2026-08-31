/**
 * ERP Manajemen — Intercompany Transactions & Settlement Service (Phase 13)
 *
 * Core Architecture:
 *   Source Company A ────────────────────────────── Destination Company B
 *         │                                                  │
 *   Debit:  1250 Piutang Intercompany                Debit:  6000 Beban / 1300 Persediaan
 *   Credit: 4000 Pendapatan Penjualan                Credit: 2200 Hutang Intercompany
 *         │                                                  │
 *         └──────────────── ATOMIC TRANSACTION ─────────────┘
 *              (If either side fails -> ROLLBACK BOTH SIDES)
 *
 * Settlement Architecture:
 *   Source Company A:                               Destination Company B:
 *   Debit:  1100 Kas / 1110 Bank                     Debit:  2200 Hutang Intercompany
 *   Credit: 1250 Piutang Intercompany                Credit: 1100 Kas / 1110 Bank
 *
 * Invariants:
 *   - source_company_id !== destination_company_id
 *   - Both company sides must be posted atomically within a single database transaction
 *   - If one company side fails, both sides are rolled back completely
 *   - Both company journals must balance independently: Sum(Debit) === Sum(Credit)
 *   - Intercompany balance must reconcile: Intercompany Receivable (A) === Intercompany Payable (B)
 */

import { z } from "zod";
import { query, queryOne, transaction } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult } from "@/types/pagination";
import { assertOpenPeriodForDate } from "@/services/accounting-service";
import {
  IntercompanyTransaction,
  IntercompanyEntry,
  IntercompanyReconciliationReport,
} from "@/types";

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const IntercompanyCreateSchema = z.object({
  source_company_id: z.number().int().positive("Source company wajib diisi"),
  destination_company_id: z.number().int().positive("Destination company wajib diisi"),
  transaction_no: z.string().min(3).max(50),
  transaction_date: z.string().min(1),
  transaction_type: z.enum(["sale", "purchase", "service", "loan", "transfer", "expense", "other"]),
  amount: z.number().positive("Nominal transaksi harus lebih dari 0"),
  description: z.string().max(255).optional().nullable(),
});

export type IntercompanyCreateInput = z.infer<typeof IntercompanyCreateSchema>;

export const IntercompanySettlementSchema = z.object({
  settlement_date: z.string().min(1),
  amount: z.number().positive().optional(),
  source_payment_account_code: z.enum(["1100", "1110"]).default("1100"), // Kas/Bank Company A
  destination_payment_account_code: z.enum(["1100", "1110"]).default("1100"), // Kas/Bank Company B
  notes: z.string().optional().nullable(),
});

export type IntercompanySettlementInput = z.infer<typeof IntercompanySettlementSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers: Account Resolution ──────────────────────────────────────────────

async function ensureIntercompanyAccounts(conn: import("mysql2/promise").PoolConnection, companyId: number) {
  // 1. Piutang Intercompany (1250)
  const [arRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1250' LIMIT 1",
    [companyId]
  );
  let arId: number;
  if (arRows.length === 0) {
    const [r] = await conn.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '1250', 'Piutang Intercompany', 'asset', 'debit', 'active')",
      [companyId]
    );
    arId = r.insertId;
  } else {
    arId = arRows[0].id;
  }

  // 2. Hutang Intercompany (2200)
  const [apRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '2200' LIMIT 1",
    [companyId]
  );
  let apId: number;
  if (apRows.length === 0) {
    const [r] = await conn.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '2200', 'Hutang Intercompany', 'liability', 'credit', 'active')",
      [companyId]
    );
    apId = r.insertId;
  } else {
    apId = apRows[0].id;
  }

  // 3. Pendapatan (4000)
  const [revRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '4000' LIMIT 1",
    [companyId]
  );
  let revId: number;
  if (revRows.length === 0) {
    const [r] = await conn.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '4000', 'Pendapatan Intercompany', 'revenue', 'credit', 'active')",
      [companyId]
    );
    revId = r.insertId;
  } else {
    revId = revRows[0].id;
  }

  // 4. Beban (6000)
  const [expRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '6000' LIMIT 1",
    [companyId]
  );
  let expId: number;
  if (expRows.length === 0) {
    const [r] = await conn.execute<import("mysql2").ResultSetHeader>(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '6000', 'Beban Intercompany', 'expense', 'debit', 'active')",
      [companyId]
    );
    expId = r.insertId;
  } else {
    expId = expRows[0].id;
  }

  return { arId, apId, revId, expId };
}

// ─── Dual-Side Atomic Intercompany Posting ────────────────────────────────────

/**
 * Creates and posts an Intercompany Transaction with Dual-Sided Balanced Journals.
 *
 * Atomic Execution:
 *   1. Company A Journal:
 *      Debit:  1250 Piutang Intercompany
 *      Credit: 4000 Pendapatan Penjualan
 *   2. Company B Journal:
 *      Debit:  6000 Beban Operasional / Persediaan
 *      Credit: 2200 Hutang Intercompany
 *
 * Invariant: If either side fails, the entire transaction is rolled back.
 */
export async function createAndPostIntercompanyTransaction(
  session: UserSessionPayload | null,
  input: IntercompanyCreateInput
): Promise<{ id: number; transaction_no: string; source_journal_no: string; destination_journal_no: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const validated = IntercompanyCreateSchema.parse(input);
  const userId = sessionUserId(session);

  // Invariant 1: Source != Destination
  if (validated.source_company_id === validated.destination_company_id) {
    throw new Error("Source company dan Destination company tidak boleh sama.");
  }

  // Check unique transaction_no
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM intercompany_transactions WHERE transaction_no = ? LIMIT 1",
    [validated.transaction_no]
  );
  if (existing) {
    throw new Error(`Nomor transaksi intercompany '${validated.transaction_no}' sudah digunakan.`);
  }

  // Period check for both companies
  const sourcePeriodId = await assertOpenPeriodForDate(validated.source_company_id, validated.transaction_date);
  const destPeriodId = await assertOpenPeriodForDate(validated.destination_company_id, validated.transaction_date);

  const amt = validated.amount;
  const amtFormatted = amt.toFixed(2);
  const srcJournalNo = `JV-IC-SRC-${validated.transaction_no}`;
  const dstJournalNo = `JV-IC-DST-${validated.transaction_no}`;

  let intercompanyTxId = 0;

  // ATOMIC DATABASE TRANSACTION FOR BOTH COMPANIES
  await transaction(async (conn) => {
    // 1. Insert Header
    const [txRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO intercompany_transactions
         (source_company_id, destination_company_id, transaction_no, transaction_date, transaction_type, amount, description, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
      [
        validated.source_company_id,
        validated.destination_company_id,
        validated.transaction_no,
        validated.transaction_date,
        validated.transaction_type,
        amtFormatted,
        validated.description ?? null,
        userId,
      ]
    );
    intercompanyTxId = txRes.insertId;

    // 2. Ensure accounts exist for both companies
    const srcAccts = await ensureIntercompanyAccounts(conn, validated.source_company_id);
    const dstAccts = await ensureIntercompanyAccounts(conn, validated.destination_company_id);

    // 3. POST SOURCE COMPANY (COMPANY A) JOURNAL
    // Debit:  1250 Piutang Intercompany
    // Credit: 4000 Pendapatan Penjualan
    const [srcJRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries
         (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'intercompany_source', ?, ?, 'posted', ?, NOW())`,
      [
        validated.source_company_id,
        sourcePeriodId,
        srcJournalNo,
        validated.transaction_date,
        intercompanyTxId,
        `Transaksi Intercompany (Source): ${validated.transaction_no}${validated.description ? ` - ${validated.description}` : ""}`,
        userId,
      ]
    );
    const srcJournalId = srcJRes.insertId;

    // Items for Source
    const [srcIt1] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Piutang Intercompany', ?, 0.00)`,
      [srcJournalId, srcAccts.arId, amtFormatted]
    );
    const [srcIt2] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Pendapatan Intercompany', 0.00, ?)`,
      [srcJournalId, srcAccts.revId, amtFormatted]
    );

    // GL for Source
    await conn.execute(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?, 0.00),
              (?, ?, ?, ?, ?, 0.00, ?)`,
      [
        validated.source_company_id, srcJournalId, srcIt1.insertId, srcAccts.arId, validated.transaction_date, amtFormatted,
        validated.source_company_id, srcJournalId, srcIt2.insertId, srcAccts.revId, validated.transaction_date, amtFormatted,
      ]
    );

    // Record source entry
    await conn.execute(
      `INSERT INTO intercompany_entries (intercompany_transaction_id, company_id, journal_entry_id, role, amount)
       VALUES (?, ?, ?, 'source', ?)`,
      [intercompanyTxId, validated.source_company_id, srcJournalId, amtFormatted]
    );

    // 4. POST DESTINATION COMPANY (COMPANY B) JOURNAL
    // Debit:  6000 Beban Intercompany / Persediaan
    // Credit: 2200 Hutang Intercompany
    const [dstJRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries
         (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'intercompany_destination', ?, ?, 'posted', ?, NOW())`,
      [
        validated.destination_company_id,
        destPeriodId,
        dstJournalNo,
        validated.transaction_date,
        intercompanyTxId,
        `Transaksi Intercompany (Destination): ${validated.transaction_no}${validated.description ? ` - ${validated.description}` : ""}`,
        userId,
      ]
    );
    const dstJournalId = dstJRes.insertId;

    // Items for Destination
    const [dstIt1] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Beban Intercompany', ?, 0.00)`,
      [dstJournalId, dstAccts.expId, amtFormatted]
    );
    const [dstIt2] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Hutang Intercompany', 0.00, ?)`,
      [dstJournalId, dstAccts.apId, amtFormatted]
    );

    // GL for Destination
    await conn.execute(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?, 0.00),
              (?, ?, ?, ?, ?, 0.00, ?)`,
      [
        validated.destination_company_id, dstJournalId, dstIt1.insertId, dstAccts.expId, validated.transaction_date, amtFormatted,
        validated.destination_company_id, dstJournalId, dstIt2.insertId, dstAccts.apId, validated.transaction_date, amtFormatted,
      ]
    );

    // Record destination entry
    await conn.execute(
      `INSERT INTO intercompany_entries (intercompany_transaction_id, company_id, journal_entry_id, role, amount)
       VALUES (?, ?, ?, 'destination', ?)`,
      [intercompanyTxId, validated.destination_company_id, dstJournalId, amtFormatted]
    );
  });

  await logAudit({
    user_id: userId,
    company_id: validated.source_company_id,
    action: "CREATE_INTERCOMPANY",
    module: "intercompany",
    entity: "intercompany_transactions",
    entity_id: intercompanyTxId,
    new_values: {
      ...validated,
      source_journal_no: srcJournalNo,
      destination_journal_no: dstJournalNo,
    },
  });

  return {
    id: intercompanyTxId,
    transaction_no: validated.transaction_no,
    source_journal_no: srcJournalNo,
    destination_journal_no: dstJournalNo,
  };
}

// ─── Intercompany Settlement ──────────────────────────────────────────────────

/**
 * Settles an intercompany transaction atomically on both sides:
 *   Source Company:      Debit 1100 Kas, Credit 1250 Piutang Intercompany
 *   Destination Company: Debit 2200 Hutang Intercompany, Credit 1100 Kas
 */
export async function settleIntercompanyTransaction(
  session: UserSessionPayload | null,
  intercompanyTxId: number,
  input: IntercompanySettlementInput
): Promise<{ settlementId: number; source_journal_no: string; destination_journal_no: string }> {
  requirePermission(session, PERMISSIONS.FINANCE_MANAGE);
  const userId = sessionUserId(session);
  const validated = IntercompanySettlementSchema.parse(input);

  const tx = await queryOne<IntercompanyTransaction>(
    "SELECT * FROM intercompany_transactions WHERE id = ?",
    [intercompanyTxId]
  );
  if (!tx) throw new Error("Transaksi intercompany tidak ditemukan.");

  if (tx.status === "settled") {
    throw new Error("Transaksi intercompany sudah diselesaikan (settled) sebelumnya.");
  }
  if (tx.status === "cancelled") {
    throw new Error("Transaksi intercompany yang dibatalkan tidak dapat diselesaikan.");
  }

  const settleAmt = validated.amount ?? Number(tx.amount);
  const amtFormatted = settleAmt.toFixed(2);

  const srcPeriodId = await assertOpenPeriodForDate(tx.source_company_id, validated.settlement_date);
  const dstPeriodId = await assertOpenPeriodForDate(tx.destination_company_id, validated.settlement_date);

  const srcJournalNo = `JV-IC-SETTLE-SRC-${tx.transaction_no}`;
  const dstJournalNo = `JV-IC-SETTLE-DST-${tx.transaction_no}`;
  let settlementId = 0;

  await transaction(async (conn) => {
    // 1. Insert Settlement record
    const [setRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO intercompany_settlements (intercompany_transaction_id, settlement_date, amount, status, notes)
       VALUES (?, ?, ?, 'posted', ?)`,
      [intercompanyTxId, validated.settlement_date, amtFormatted, validated.notes ?? null]
    );
    settlementId = setRes.insertId;

    // 2. Lookup accounts
    const [srcCashAcct] = await conn.execute<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
      [tx.source_company_id, validated.source_payment_account_code]
    );
    const [srcArAcct] = await conn.execute<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = '1250' LIMIT 1",
      [tx.source_company_id]
    );

    const [dstApAcct] = await conn.execute<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = '2200' LIMIT 1",
      [tx.destination_company_id]
    );
    const [dstCashAcct] = await conn.execute<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
      [tx.destination_company_id, validated.destination_payment_account_code]
    );

    // 3. Post Source Company Settlement Journal: Debit Kas, Credit Piutang Intercompany
    const [srcJRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'intercompany_settlement', ?, 'Penyelesaian Pelunasan Piutang Intercompany', 'posted', ?, NOW())`,
      [tx.source_company_id, srcPeriodId, srcJournalNo, validated.settlement_date, settlementId, userId]
    );
    const srcJId = srcJRes.insertId;

    const [srcIt1] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Penerimaan Kas Pelunasan Intercompany', ?, 0.00)`,
      [srcJId, srcCashAcct[0].id, amtFormatted]
    );
    const [srcIt2] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Pelunasan Piutang Intercompany', 0.00, ?)`,
      [srcJId, srcArAcct[0].id, amtFormatted]
    );

    await conn.execute(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?, 0.00),
              (?, ?, ?, ?, ?, 0.00, ?)`,
      [
        tx.source_company_id, srcJId, srcIt1.insertId, srcCashAcct[0].id, validated.settlement_date, amtFormatted,
        tx.source_company_id, srcJId, srcIt2.insertId, srcArAcct[0].id, validated.settlement_date, amtFormatted,
      ]
    );

    // 4. Post Destination Company Settlement Journal: Debit Hutang Intercompany, Credit Kas
    const [dstJRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entries (company_id, period_id, journal_no, journal_date, source_type, source_id, description, status, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'intercompany_settlement', ?, 'Pembayaran Pelunasan Hutang Intercompany', 'posted', ?, NOW())`,
      [tx.destination_company_id, dstPeriodId, dstJournalNo, validated.settlement_date, settlementId, userId]
    );
    const dstJId = dstJRes.insertId;

    const [dstIt1] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Pelunasan Hutang Intercompany', ?, 0.00)`,
      [dstJId, dstApAcct[0].id, amtFormatted]
    );
    const [dstIt2] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit)
       VALUES (?, ?, 'Pengeluaran Kas Pelunasan Intercompany', 0.00, ?)`,
      [dstJId, dstCashAcct[0].id, amtFormatted]
    );

    await conn.execute(
      `INSERT INTO general_ledger (company_id, journal_entry_id, journal_entry_item_id, account_id, posting_date, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?, 0.00),
              (?, ?, ?, ?, ?, 0.00, ?)`,
      [
        tx.destination_company_id, dstJId, dstIt1.insertId, dstApAcct[0].id, validated.settlement_date, amtFormatted,
        tx.destination_company_id, dstJId, dstIt2.insertId, dstCashAcct[0].id, validated.settlement_date, amtFormatted,
      ]
    );

    // 5. Update transaction status
    await conn.execute(
      "UPDATE intercompany_transactions SET status = 'settled' WHERE id = ?",
      [intercompanyTxId]
    );
  });

  await logAudit({
    user_id: userId,
    company_id: tx.source_company_id,
    action: "SETTLE_INTERCOMPANY",
    module: "intercompany",
    entity: "intercompany_settlements",
    entity_id: settlementId,
    new_values: {
      intercompany_transaction_id: intercompanyTxId,
      amount: settleAmt,
      source_journal_no: srcJournalNo,
      destination_journal_no: dstJournalNo,
    },
  });

  return {
    settlementId,
    source_journal_no: srcJournalNo,
    destination_journal_no: dstJournalNo,
  };
}

// ─── Reconciliation Report ────────────────────────────────────────────────────

/**
 * Generates an Intercompany Reconciliation Report between Source and Destination company.
 *
 * Verifies:
 *   Total Intercompany Receivable (Source Company) === Total Intercompany Payable (Destination Company)
 */
export async function getIntercompanyReconciliation(
  session: UserSessionPayload | null,
  sourceCompanyId: number,
  destinationCompanyId: number,
  asOfDate?: string
): Promise<IntercompanyReconciliationReport> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const targetDate = asOfDate || new Date().toISOString().split("T")[0];

  const srcComp = (await queryOne<{ name: string }>("SELECT name FROM companies WHERE id = ?", [sourceCompanyId]))!;
  const dstComp = (await queryOne<{ name: string }>("SELECT name FROM companies WHERE id = ?", [destinationCompanyId]))!;

  // 1. Sum Intercompany Receivables in Source Company (GL mutasi)
  const srcGl = await queryOne<{ total_debit: number; total_credit: number }>(
    `SELECT COALESCE(SUM(gl.debit), 0) AS total_debit, COALESCE(SUM(gl.credit), 0) AS total_credit
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.code = '1250' AND gl.posting_date <= ?`,
    [sourceCompanyId, targetDate]
  );
  const sourceReceivableTotal = (Number(srcGl?.total_debit) || 0) - (Number(srcGl?.total_credit) || 0);

  // 2. Sum Intercompany Payables in Destination Company (GL mutasi)
  const dstGl = await queryOne<{ total_debit: number; total_credit: number }>(
    `SELECT COALESCE(SUM(gl.debit), 0) AS total_debit, COALESCE(SUM(gl.credit), 0) AS total_credit
     FROM general_ledger gl
     JOIN accounts a ON gl.account_id = a.id
     WHERE gl.company_id = ? AND a.code = '2200' AND gl.posting_date <= ?`,
    [destinationCompanyId, targetDate]
  );
  const destinationPayableTotal = (Number(dstGl?.total_credit) || 0) - (Number(dstGl?.total_debit) || 0);

  // 3. Transactions between the two companies
  const transactions = await query<IntercompanyTransaction[]>(
    `SELECT it.*,
            c1.name AS source_company_name,
            c2.name AS destination_company_name
     FROM intercompany_transactions it
     JOIN companies c1 ON it.source_company_id = c1.id
     JOIN companies c2 ON it.destination_company_id = c2.id
     WHERE it.source_company_id = ? AND it.destination_company_id = ? AND it.transaction_date <= ?
     ORDER BY it.transaction_date DESC, it.id DESC`,
    [sourceCompanyId, destinationCompanyId, targetDate]
  );

  const difference = Math.abs(sourceReceivableTotal - destinationPayableTotal);
  const is_reconciled = difference < 0.01;

  return {
    source_company_id: sourceCompanyId,
    source_company_name: srcComp?.name || `Company #${sourceCompanyId}`,
    destination_company_id: destinationCompanyId,
    destination_company_name: dstComp?.name || `Company #${destinationCompanyId}`,
    as_of_date: targetDate,
    source_receivable_total: Math.max(0, sourceReceivableTotal),
    destination_payable_total: Math.max(0, destinationPayableTotal),
    difference,
    is_reconciled,
    transactions,
  };
}

// ─── Query Listing ────────────────────────────────────────────────────────────

export async function listIntercompanyTransactions(
  session: UserSessionPayload | null,
  params?: { page?: number; limit?: number; status?: string; transactionType?: string },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<IntercompanyTransaction>> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["(it.source_company_id = ? OR it.destination_company_id = ?)"];
  const qp: (string | number)[] = [companyId, companyId];

  if (params?.status && params.status !== "all") {
    conditions.push("it.status = ?");
    qp.push(params.status);
  }
  if (params?.transactionType) {
    conditions.push("it.transaction_type = ?");
    qp.push(params.transactionType);
  }

  const where = conditions.join(" AND ");
  const countRes = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM intercompany_transactions it WHERE ${where}`,
    qp
  );
  const total = countRes[0]?.total ?? 0;

  const rows = await query<IntercompanyTransaction[]>(
    `SELECT it.*,
            c1.name AS source_company_name,
            c2.name AS destination_company_name
     FROM intercompany_transactions it
     JOIN companies c1 ON it.source_company_id = c1.id
     JOIN companies c2 ON it.destination_company_id = c2.id
     WHERE ${where}
     ORDER BY it.transaction_date DESC, it.id DESC
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

export async function getIntercompanyTransactionById(
  session: UserSessionPayload | null,
  id: number
): Promise<{ transaction: IntercompanyTransaction; entries: IntercompanyEntry[] } | null> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const tx = await queryOne<IntercompanyTransaction>(
    `SELECT it.*,
            c1.name AS source_company_name,
            c2.name AS destination_company_name
     FROM intercompany_transactions it
     JOIN companies c1 ON it.source_company_id = c1.id
     JOIN companies c2 ON it.destination_company_id = c2.id
     WHERE it.id = ?`,
    [id]
  );
  if (!tx) return null;

  const entries = await query<IntercompanyEntry[]>(
    `SELECT ie.*, c.name AS company_name, je.journal_no
     FROM intercompany_entries ie
     JOIN companies c ON ie.company_id = c.id
     LEFT JOIN journal_entries je ON ie.journal_entry_id = je.id
     WHERE ie.intercompany_transaction_id = ?`,
    [id]
  );

  return { transaction: tx, entries };
}
