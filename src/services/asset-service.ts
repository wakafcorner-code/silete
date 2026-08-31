/**
 * ERP Manajemen — Fixed Assets & Depreciation Service (Phase 12)
 *
 * Core Workflow:
 *   Asset Category & Useful Life
 *          ↓
 *   Asset Register & Acquisition
 *          ↓ (Acquisition Journal: Debit 1400 Aset Tetap, Credit 1100 Kas / 2100 AP)
 *   Monthly Straight-Line Depreciation
 *          ↓ (Depreciation Journal: Debit 6000 Beban Penyusutan, Credit 1500 Akumulasi Penyusutan)
 *   Accumulated Depreciation Tracking & Book Value
 *          ↓
 *   Disposal / Write-off
 *          ↓ (Disposal Journal: Debit 1500 Akumulasi, Debit Kas/Loss, Credit 1400 Aset Tetap)
 *   Depreciation Stops Post-Disposal
 *
 * Invariants:
 *   - Straight-line method: Monthly = (Cost - Residual) / UsefulLifeMonths
 *   - Accumulated depreciation cannot exceed (Cost - Residual)
 *   - Book value = Cost - Accumulated Depreciation >= Residual
 *   - Disposed assets cannot be depreciated
 *   - All accounting entries are routed through the central Accounting Service
 */

import { z } from "zod";
import { query, queryOne, execute, transaction } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult } from "@/types/pagination";
import { postJournalEntry } from "@/services/accounting-service";
import { Asset, AssetCategory, AssetDepreciation } from "@/types";

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const AssetCategorySchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(150),
  useful_life_months: z.number().int().min(1).default(60),
  depreciation_method: z.literal("straight_line").default("straight_line"),
});

export type AssetCategoryInput = z.infer<typeof AssetCategorySchema>;

export const AssetCreateSchema = z.object({
  category_id: z.number().int().positive("Kategori aset wajib dipilih"),
  asset_code: z.string().min(2).max(50),
  name: z.string().min(2).max(200),
  acquisition_date: z.string().min(1),
  acquisition_cost: z.number().positive("Biaya perolehan aset harus lebih dari 0"),
  residual_value: z.number().nonnegative().default(0),
  payment_account_code: z.enum(["1100", "1110", "2100"]).default("1100"), // 1100 Kas, 1110 Bank, 2100 Hutang
  post_acquisition_journal: z.boolean().default(true),
});

export type AssetCreateInput = z.infer<typeof AssetCreateSchema>;

export const AssetDisposalSchema = z.object({
  disposal_date: z.string().min(1),
  disposal_price: z.number().nonnegative().default(0),
  proceeds_account_code: z.enum(["1100", "1110"]).default("1100"),
  notes: z.string().optional().nullable(),
});

export type AssetDisposalInput = z.infer<typeof AssetDisposalSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Asset Categories ─────────────────────────────────────────────────────────

export async function listAssetCategories(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<AssetCategory[]> {
  requirePermission(session, PERMISSIONS.ASSET_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<AssetCategory[]>(
    "SELECT * FROM asset_categories WHERE company_id = ? ORDER BY code ASC",
    [companyId]
  );
}

export async function createAssetCategory(
  session: UserSessionPayload | null,
  input: AssetCategoryInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; code: string }> {
  requirePermission(session, PERMISSIONS.ASSET_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = AssetCategorySchema.parse(input);
  const userId = sessionUserId(session);

  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM asset_categories WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) {
    throw new Error(`Kategori aset dengan kode '${validated.code}' sudah digunakan.`);
  }

  const res = await execute(
    `INSERT INTO asset_categories (company_id, code, name, useful_life_months, depreciation_method)
     VALUES (?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.code,
      validated.name,
      validated.useful_life_months,
      validated.depreciation_method,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "assets",
    entity: "asset_categories",
    entity_id: res.insertId,
    new_values: { ...validated },
  });

  return { id: res.insertId, code: validated.code };
}

// ─── Asset Register & Acquisition ─────────────────────────────────────────────

export async function listAssets(
  session: UserSessionPayload | null,
  params?: { page?: number; limit?: number; status?: string; categoryId?: number; search?: string },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Asset>> {
  requirePermission(session, PERMISSIONS.ASSET_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["a.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (params?.status && params.status !== "all") {
    conditions.push("a.status = ?");
    qp.push(params.status);
  }
  if (params?.categoryId) {
    conditions.push("a.category_id = ?");
    qp.push(params.categoryId);
  }
  if (params?.search) {
    conditions.push("(a.asset_code LIKE ? OR a.name LIKE ?)");
    qp.push(`%${params.search}%`, `%${params.search}%`);
  }

  const where = conditions.join(" AND ");
  const countRes = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM assets a WHERE ${where}`,
    qp
  );
  const total = countRes[0]?.total ?? 0;

  const rows = await query<Asset[]>(
    `SELECT a.*,
            ac.name AS category_name, ac.code AS category_code, ac.useful_life_months,
            (a.acquisition_cost - a.accumulated_depreciation) AS book_value,
            ROUND((a.acquisition_cost - a.residual_value) / NULLIF(ac.useful_life_months, 0), 2) AS monthly_depreciation
     FROM assets a
     JOIN asset_categories ac ON a.category_id = ac.id
     WHERE ${where}
     ORDER BY a.acquisition_date DESC, a.id DESC
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

export async function getAssetById(
  session: UserSessionPayload | null,
  id: number
): Promise<Asset | null> {
  requirePermission(session, PERMISSIONS.ASSET_VIEW);
  const row = await queryOne<Asset>(
    `SELECT a.*,
            ac.name AS category_name, ac.code AS category_code, ac.useful_life_months,
            (a.acquisition_cost - a.accumulated_depreciation) AS book_value,
            ROUND((a.acquisition_cost - a.residual_value) / NULLIF(ac.useful_life_months, 0), 2) AS monthly_depreciation
     FROM assets a
     JOIN asset_categories ac ON a.category_id = ac.id
     WHERE a.id = ?`,
    [id]
  );
  if (!row) return null;
  assertEntityCompanyAccess(session, row.company_id);
  return row;
}

export async function createAsset(
  session: UserSessionPayload | null,
  input: AssetCreateInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; asset_code: string; journal_no?: string }> {
  requirePermission(session, PERMISSIONS.ASSET_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = AssetCreateSchema.parse(input);
  const userId = sessionUserId(session);

  // Check unique code
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM assets WHERE company_id = ? AND asset_code = ? LIMIT 1",
    [companyId, validated.asset_code]
  );
  if (existing) {
    throw new Error(`Kode aset '${validated.asset_code}' sudah terdaftar.`);
  }

  // Validate category belongs to company
  const category = await queryOne<AssetCategory>(
    "SELECT * FROM asset_categories WHERE id = ? AND company_id = ?",
    [validated.category_id, companyId]
  );
  if (!category) {
    throw new Error("Kategori aset tidak valid atau bukan milik perusahaan ini.");
  }

  if (validated.residual_value >= validated.acquisition_cost) {
    throw new Error("Nilai residu tidak boleh lebih besar atau sama dengan biaya perolehan.");
  }

  let assetId = 0;
  let journalNo: string | undefined;

  // Insert asset record
  const res = await execute(
    `INSERT INTO assets
       (company_id, category_id, asset_code, name, acquisition_date, acquisition_cost, residual_value, accumulated_depreciation, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, 'active')`,
    [
      companyId,
      validated.category_id,
      validated.asset_code,
      validated.name,
      validated.acquisition_date,
      validated.acquisition_cost.toFixed(2),
      validated.residual_value.toFixed(2),
    ]
  );
  assetId = res.insertId;

  // Post Acquisition Journal via Accounting Engine
  if (validated.post_acquisition_journal) {
    const assetAcct = await queryOne<{ id: number }>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = '1400' LIMIT 1",
      [companyId]
    );
    const creditAcct = await queryOne<{ id: number }>(
      "SELECT id FROM accounts WHERE company_id = ? AND code = ? LIMIT 1",
      [companyId, validated.payment_account_code]
    );

    if (assetAcct && creditAcct) {
      const jRes = await postJournalEntry(
        session,
        {
          journal_no: `JV-ACQ-${validated.asset_code}`,
          journal_date: validated.acquisition_date,
          description: `Perolehan Aset Tetap: ${validated.name} (${validated.asset_code})`,
          source_type: "fixed_asset_acquisition",
          source_id: assetId,
          items: [
            {
              account_id: assetAcct.id,
              description: `Aset Tetap - ${validated.name}`,
              debit: validated.acquisition_cost,
              credit: 0,
            },
            {
              account_id: creditAcct.id,
              description: `Pembayaran Perolehan Aset - ${validated.name}`,
              debit: 0,
              credit: validated.acquisition_cost,
            },
          ],
        },
        companyId
      );
      journalNo = jRes.journal_no;
    }
  }

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE_ASSET",
    module: "assets",
    entity: "assets",
    entity_id: assetId,
    new_values: { ...validated, journal_no: journalNo },
  });

  return { id: assetId, asset_code: validated.asset_code, journal_no: journalNo };
}

// ─── Depreciation Engine ──────────────────────────────────────────────────────

/**
 * Calculates and posts a single monthly depreciation entry for an asset.
 *
 * Method: Straight-Line
 * Monthly Depreciation = (Acquisition Cost - Residual Value) / Useful Life (Months)
 *
 * Invariants:
 *   - Cannot depreciate disposed or inactive assets
 *   - Accumulated depreciation cannot exceed (Cost - Residual Value)
 *   - Book Value cannot go below Residual Value
 *   - Posts journal: Debit 6000 (Beban Penyusutan), Credit 1500 (Akumulasi Penyusutan)
 */
export async function postAssetDepreciation(
  session: UserSessionPayload | null,
  assetId: number,
  depreciationDate: string,
  customAmount?: number
): Promise<{ id: number; amount: number; journal_no: string; accumulated_depreciation: number; book_value: number }> {
  requirePermission(session, PERMISSIONS.ASSET_MANAGE);
  const userId = sessionUserId(session);

  const asset = await queryOne<Asset & { useful_life_months: number }>(
    `SELECT a.*, ac.useful_life_months
     FROM assets a
     JOIN asset_categories ac ON a.category_id = ac.id
     WHERE a.id = ?`,
    [assetId]
  );

  if (!asset) throw new Error("Aset tidak ditemukan.");
  assertEntityCompanyAccess(session, asset.company_id);

  // Invariant 1: Disposed assets cannot be depreciated
  if (asset.status === "disposed") {
    throw new Error(`Aset '${asset.asset_code}' sudah dilepas/dijual (disposed). Penyusutan tidak dapat dilakukan.`);
  }
  if (asset.status === "inactive") {
    throw new Error(`Aset '${asset.asset_code}' dalam status non-aktif.`);
  }

  const cost = Number(asset.acquisition_cost);
  const residual = Number(asset.residual_value);
  const currentAccum = Number(asset.accumulated_depreciation);
  const usefulLife = Number(asset.useful_life_months) || 60;

  const maxDepreciable = Math.max(0, cost - residual);
  const remainingDepreciable = Math.max(0, maxDepreciable - currentAccum);

  if (remainingDepreciable <= 0.001) {
    throw new Error(`Aset '${asset.asset_code}' sudah tersusutkan secara penuh (nilai buku mencapai nilai residu).`);
  }

  // Calculate straight-line monthly amount or use custom amount
  const monthlyCalculated = maxDepreciable / usefulLife;
  let depAmount = customAmount !== undefined ? customAmount : monthlyCalculated;

  // Invariant 2: Cannot exceed remaining depreciable amount
  if (depAmount > remainingDepreciable + 0.001) {
    depAmount = remainingDepreciable;
  }
  depAmount = Math.round(depAmount * 100) / 100;

  if (depAmount <= 0) {
    throw new Error("Nominal penyusutan tidak valid.");
  }

  // 1. Post Depreciation Journal via Central Accounting Engine
  // Debit: 6000 (Beban Penyusutan)
  // Credit: 1500 (Akumulasi Penyusutan)
  let expAcct = await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code IN ('6100', '6000') ORDER BY code DESC LIMIT 1",
    [asset.company_id]
  );
  if (!expAcct) {
    const r = await execute(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '6000', 'Beban Penyusutan', 'expense', 'debit', 'active')",
      [asset.company_id]
    );
    expAcct = { id: r.insertId };
  }

  let accumAcct = await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1500' LIMIT 1",
    [asset.company_id]
  );
  if (!accumAcct) {
    const r = await execute(
      "INSERT INTO accounts (company_id, code, name, account_type, normal_balance, status) VALUES (?, '1500', 'Akumulasi Penyusutan', 'asset', 'credit', 'active')",
      [asset.company_id]
    );
    accumAcct = { id: r.insertId };
  }

  const journalRes = await postJournalEntry(
    session,
    {
      journal_no: `JV-DEP-${asset.asset_code}-${depreciationDate.replace(/-/g, "").slice(0, 6)}`,
      journal_date: depreciationDate,
      description: `Penyusutan Aset Tetap: ${asset.name} (${asset.asset_code})`,
      source_type: "asset_depreciation",
      source_id: assetId,
      items: [
        {
          account_id: expAcct.id,
          description: `Beban Penyusutan - ${asset.name}`,
          debit: depAmount,
          credit: 0,
        },
        {
          account_id: accumAcct.id,
          description: `Akumulasi Penyusutan - ${asset.name}`,
          debit: 0,
          credit: depAmount,
        },
      ],
    },
    asset.company_id
  );

  let newAccum = currentAccum + depAmount;
  let newBookValue = cost - newAccum;
  let depRecordId = 0;

  // 2. Atomic Database Update
  await transaction(async (conn) => {
    // Record in asset_depreciations
    const [depRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO asset_depreciations (asset_id, depreciation_date, amount, journal_entry_id, status)
       VALUES (?, ?, ?, ?, 'posted')`,
      [assetId, depreciationDate, depAmount.toFixed(2), journalRes.id]
    );
    depRecordId = depRes.insertId;

    // Update asset accumulated depreciation
    await conn.execute(
      "UPDATE assets SET accumulated_depreciation = accumulated_depreciation + ? WHERE id = ?",
      [depAmount.toFixed(2), assetId]
    );
  });

  newAccum = Math.round(newAccum * 100) / 100;
  newBookValue = Math.round(newBookValue * 100) / 100;

  await logAudit({
    user_id: userId,
    company_id: asset.company_id,
    action: "DEPRECIATE_ASSET",
    module: "assets",
    entity: "asset_depreciations",
    entity_id: depRecordId,
    new_values: {
      asset_id: assetId,
      amount: depAmount,
      accumulated_depreciation: newAccum,
      book_value: newBookValue,
      journal_no: journalRes.journal_no,
    },
  });

  return {
    id: depRecordId,
    amount: depAmount,
    journal_no: journalRes.journal_no,
    accumulated_depreciation: newAccum,
    book_value: newBookValue,
  };
}

export async function listAssetDepreciations(
  session: UserSessionPayload | null,
  assetId: number
): Promise<AssetDepreciation[]> {
  requirePermission(session, PERMISSIONS.ASSET_VIEW);
  const asset = await queryOne<Asset>("SELECT company_id FROM assets WHERE id = ?", [assetId]);
  if (!asset) throw new Error("Aset tidak ditemukan.");
  assertEntityCompanyAccess(session, asset.company_id);

  return query<AssetDepreciation[]>(
    `SELECT ad.*, je.journal_no
     FROM asset_depreciations ad
     LEFT JOIN journal_entries je ON ad.journal_entry_id = je.id
     WHERE ad.asset_id = ?
     ORDER BY ad.depreciation_date DESC, ad.id DESC`,
    [assetId]
  );
}

// ─── Asset Disposal & Write-Off ───────────────────────────────────────────────

/**
 * Disposes an active asset.
 *
 * Disposal Accounting:
 *   Debit:  Akumulasi Penyusutan (1500) (Full accumulated amount)
 *   Debit:  Kas/Bank (1100/1110) (if proceeds > 0)
 *   Debit:  Kerugian Pelepasan Aset (6000) (if book_value > proceeds)
 *   Credit: Keuntungan Pelepasan Aset (4000) (if proceeds > book_value)
 *   Credit: Aset Tetap (1400) (Original acquisition cost)
 *
 * Invariant: Sum(Debit) === Sum(Credit)
 */
export async function disposeAsset(
  session: UserSessionPayload | null,
  assetId: number,
  input: AssetDisposalInput
): Promise<{ journal_no: string; book_value_at_disposal: number; gain_loss: number }> {
  requirePermission(session, PERMISSIONS.ASSET_MANAGE);
  const userId = sessionUserId(session);
  const validated = AssetDisposalSchema.parse(input);

  const asset = await queryOne<Asset>("SELECT * FROM assets WHERE id = ?", [assetId]);
  if (!asset) throw new Error("Aset tidak ditemukan.");
  assertEntityCompanyAccess(session, asset.company_id);

  if (asset.status === "disposed") {
    throw new Error(`Aset '${asset.asset_code}' sudah dilepas sebelumnya.`);
  }

  const cost = Number(asset.acquisition_cost);
  const accum = Number(asset.accumulated_depreciation);
  const bookValue = cost - accum;
  const proceeds = validated.disposal_price;
  const gainLoss = proceeds - bookValue; // positive = gain, negative = loss

  // Accounts lookup
  const assetAcct = (await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1400'",
    [asset.company_id]
  ))!;
  const accumAcct = (await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '1500'",
    [asset.company_id]
  ))!;
  const cashAcct = (await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = ?",
    [asset.company_id, validated.proceeds_account_code]
  ))!;
  const expAcct = (await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '6000'",
    [asset.company_id]
  ))!;
  const revAcct = (await queryOne<{ id: number }>(
    "SELECT id FROM accounts WHERE company_id = ? AND code = '4000'",
    [asset.company_id]
  ))!;

  const journalItems: Array<{ account_id: number; description: string; debit: number; credit: number }> = [];

  // 1. Debit Accumulated Depreciation
  if (accum > 0) {
    journalItems.push({
      account_id: accumAcct.id,
      description: `Penghapusan Akumulasi Penyusutan - ${asset.name}`,
      debit: accum,
      credit: 0,
    });
  }

  // 2. Debit Proceeds (Cash/Bank)
  if (proceeds > 0) {
    journalItems.push({
      account_id: cashAcct.id,
      description: `Penerimaan Hasil Pelepasan Aset - ${asset.name}`,
      debit: proceeds,
      credit: 0,
    });
  }

  // 3. Loss (Debit) or Gain (Credit)
  if (gainLoss < -0.001) {
    journalItems.push({
      account_id: expAcct.id,
      description: `Rugi Pelepasan Aset Tetap - ${asset.name}`,
      debit: Math.abs(gainLoss),
      credit: 0,
    });
  } else if (gainLoss > 0.001) {
    journalItems.push({
      account_id: revAcct.id,
      description: `Laba Pelepasan Aset Tetap - ${asset.name}`,
      debit: 0,
      credit: gainLoss,
    });
  }

  // 4. Credit Asset Cost (1400)
  journalItems.push({
    account_id: assetAcct.id,
    description: `Pelepasan Aset Tetap - ${asset.name}`,
    debit: 0,
    credit: cost,
  });

  // Post Disposal Journal
  const journalRes = await postJournalEntry(
    session,
    {
      journal_no: `JV-DISP-${asset.asset_code}`,
      journal_date: validated.disposal_date,
      description: `Pelepasan Aset Tetap: ${asset.name} (${asset.asset_code})${validated.notes ? ` - ${validated.notes}` : ""}`,
      source_type: "fixed_asset_disposal",
      source_id: assetId,
      items: journalItems,
    },
    asset.company_id
  );

  // Update asset status to disposed
  await execute(
    "UPDATE assets SET status = 'disposed' WHERE id = ?",
    [assetId]
  );

  await logAudit({
    user_id: userId,
    company_id: asset.company_id,
    action: "DISPOSE_ASSET",
    module: "assets",
    entity: "assets",
    entity_id: assetId,
    new_values: {
      status: "disposed",
      disposal_price: proceeds,
      book_value_at_disposal: bookValue,
      gain_loss: gainLoss,
      journal_no: journalRes.journal_no,
    },
  });

  return {
    journal_no: journalRes.journal_no,
    book_value_at_disposal: bookValue,
    gain_loss: gainLoss,
  };
}
