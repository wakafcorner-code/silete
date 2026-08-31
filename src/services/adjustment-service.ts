/**
 * ERP Manajemen — Stock Adjustment Service
 *
 * Workflow: draft → posted | cancelled
 * Reason is REQUIRED per AGENTS.md Section 7.
 * Posting calls inventory-service.recordSignedMovement() atomically.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { StockAdjustment } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import {
  resolveCompanyScope,
  assertEntityCompanyAccess,
} from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { recordSignedMovement } from "@/services/inventory-service";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult, PaginationParams } from "@/types/pagination";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const StockAdjustmentSchema = z.object({
  warehouse_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  /**
   * quantity_delta can be negative (shrink) or positive (surplus).
   * Must NOT be zero.
   */
  quantity_delta: z
    .number()
    .refine((v) => v !== 0, { message: "Delta tidak boleh nol." }),
  reason: z.string().min(5, "Alasan wajib diisi minimal 5 karakter.").max(255),
  adjustment_date: z.string().min(1), // "YYYY-MM-DD"
});

export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;

// ─── Helper ───────────────────────────────────────────────────────────────────

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

async function assertAdjustmentAccess(
  session: UserSessionPayload | null,
  adjustmentId: number
): Promise<StockAdjustment> {
  const adj = await queryOne<StockAdjustment>(
    `SELECT sa.*, p.name AS product_name, p.sku AS product_sku, w.name AS warehouse_name
     FROM stock_adjustments sa
     JOIN products p ON sa.product_id = p.id
     JOIN warehouses w ON sa.warehouse_id = w.id
     WHERE sa.id = ?`,
    [adjustmentId]
  );
  if (!adj) throw new Error("Stock adjustment tidak ditemukan.");
  assertEntityCompanyAccess(session, adj.company_id);
  return adj;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new stock adjustment in DRAFT status.
 * Reason is mandatory.
 */
export async function createAdjustment(
  session: UserSessionPayload | null,
  input: StockAdjustmentInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = StockAdjustmentSchema.parse(input);
  const userId = sessionUserId(session);

  // Verify warehouse belongs to company
  const warehouse = await queryOne<{ id: number }>(
    "SELECT id FROM warehouses WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.warehouse_id, companyId]
  );
  if (!warehouse) throw new Error("Gudang tidak ditemukan atau akses ditolak.");

  // Verify product belongs to company
  const product = await queryOne<{ id: number }>(
    "SELECT id FROM products WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.product_id, companyId]
  );
  if (!product) throw new Error("Produk tidak ditemukan atau tidak aktif.");

  const res = await execute(
    `INSERT INTO stock_adjustments (company_id, warehouse_id, product_id, quantity_delta, reason, adjustment_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      companyId,
      validated.warehouse_id,
      validated.product_id,
      validated.quantity_delta.toFixed(4),
      validated.reason,
      validated.adjustment_date,
      userId,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "inventory",
    entity: "stock_adjustments",
    entity_id: res.insertId,
    new_values: { ...validated, company_id: companyId, status: "draft" },
  });

  return { id: res.insertId };
}

/**
 * Post a stock adjustment: status → posted, records inventory movement.
 */
export async function postAdjustment(
  session: UserSessionPayload | null,
  adjustmentId: number,
  allowNegativeStock = false
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const adj = await assertAdjustmentAccess(session, adjustmentId);
  const userId = sessionUserId(session);

  if (adj.status !== "draft") {
    throw new Error(`Cannot post adjustment in status '${adj.status}'.`);
  }

  const delta = Number(adj.quantity_delta);

  await transaction(async (conn) => {
    // 1. Update status
    await conn.execute(
      "UPDATE stock_adjustments SET status = 'posted' WHERE id = ?",
      [adjustmentId]
    );

    // 2. Record signed movement (handles +/- direction)
    await recordSignedMovement(
      conn,
      {
        company_id: adj.company_id,
        warehouse_id: adj.warehouse_id,
        product_id: adj.product_id,
        quantity_delta: delta,
        reference_type: "stock_adjustment",
        reference_id: adjustmentId,
        notes: `Adjustment: ${adj.reason}`,
        created_by: userId,
      },
      allowNegativeStock
    );
  });

  await logAudit({
    user_id: userId,
    company_id: adj.company_id,
    action: "POST",
    module: "inventory",
    entity: "stock_adjustments",
    entity_id: adjustmentId,
    new_values: { status: "posted" },
  });
}

/**
 * Cancel a draft adjustment.
 */
export async function cancelAdjustment(
  session: UserSessionPayload | null,
  adjustmentId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const adj = await assertAdjustmentAccess(session, adjustmentId);
  if (adj.status !== "draft") {
    throw new Error("Hanya adjustment berstatus 'draft' yang dapat dibatalkan.");
  }
  await execute("UPDATE stock_adjustments SET status = 'cancelled' WHERE id = ?", [adjustmentId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: adj.company_id,
    action: "CANCEL",
    module: "inventory",
    entity: "stock_adjustments",
    entity_id: adjustmentId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List adjustments for the authorized company.
 */
export async function listAdjustments(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & { status?: string; warehouseId?: number; productId?: number },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<StockAdjustment>> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, warehouseId, productId } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["sa.company_id = ?"];
  const qp: (string | number)[] = [companyId];
  if (status) { conditions.push("sa.status = ?"); qp.push(status); }
  if (warehouseId) { conditions.push("sa.warehouse_id = ?"); qp.push(warehouseId); }
  if (productId) { conditions.push("sa.product_id = ?"); qp.push(productId); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM stock_adjustments sa WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<StockAdjustment[]>(
    `SELECT sa.*, p.name AS product_name, p.sku AS product_sku, w.name AS warehouse_name
     FROM stock_adjustments sa
     JOIN products p ON sa.product_id = p.id
     JOIN warehouses w ON sa.warehouse_id = w.id
     WHERE ${where}
     ORDER BY sa.adjustment_date DESC, sa.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get adjustment by ID.
 */
export async function getAdjustmentById(
  session: UserSessionPayload | null,
  adjustmentId: number
): Promise<StockAdjustment | null> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  return assertAdjustmentAccess(session, adjustmentId);
}
