/**
 * ERP Manajemen — Goods Receiving Service
 *
 * Workflow: draft → post
 *   POST: creates inventory_transaction (RECEIPT) + updates stock_balances
 *         atomically inside a DB transaction.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { GoodsReceipt, GoodsReceiptItem } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import {
  resolveCompanyScope,
  assertEntityCompanyAccess,
} from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { recordMovement } from "@/services/inventory-service";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult, PaginationParams } from "@/types/pagination";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GoodsReceiptItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive("Quantity must be positive"),
  unit_cost: z.number().min(0).default(0),
});

export const GoodsReceiptSchema = z.object({
  warehouse_id: z.number().int().positive(),
  supplier_id: z.number().int().positive().optional().nullable(),
  purchase_order_id: z.number().int().positive().optional().nullable(),
  receipt_no: z.string().min(1).max(50),
  receipt_date: z.string().min(1), // "YYYY-MM-DD"
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(GoodsReceiptItemSchema)
    .min(1, "At least one item is required"),
});

export type GoodsReceiptInput = z.infer<typeof GoodsReceiptSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get session user ID safely */
function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

async function assertGoodsReceiptAccess(
  session: UserSessionPayload | null,
  receiptId: number
): Promise<GoodsReceipt> {
  const receipt = await queryOne<GoodsReceipt>(
    `SELECT gr.*, w.name AS warehouse_name
     FROM goods_receipts gr
     JOIN warehouses w ON gr.warehouse_id = w.id
     WHERE gr.id = ?`,
    [receiptId]
  );
  if (!receipt) throw new Error("Goods receipt tidak ditemukan.");
  assertEntityCompanyAccess(session, receipt.company_id);
  return receipt;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new goods receipt in DRAFT status.
 */
export async function createGoodsReceipt(
  session: UserSessionPayload | null,
  input: GoodsReceiptInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; receipt_no: string }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = GoodsReceiptSchema.parse(input);
  const userId = sessionUserId(session);

  // Verify warehouse belongs to company
  const warehouse = await queryOne<{ id: number; company_id: number }>(
    "SELECT id, company_id FROM warehouses WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.warehouse_id, companyId]
  );
  if (!warehouse) throw new Error("Gudang tidak ditemukan atau akses ditolak.");

  // Check receipt_no uniqueness within company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM goods_receipts WHERE company_id = ? AND receipt_no = ? LIMIT 1",
    [companyId, validated.receipt_no]
  );
  if (existing) throw new Error(`Nomor penerimaan ${validated.receipt_no} sudah digunakan.`);

  const result = await transaction(async (conn) => {
    // Insert header
    const [headerRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO goods_receipts (company_id, purchase_order_id, supplier_id, warehouse_id, receipt_no, receipt_date, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [
        companyId,
        validated.purchase_order_id ?? null,
        validated.supplier_id ?? null,
        validated.warehouse_id,
        validated.receipt_no,
        validated.receipt_date,
        validated.notes ?? null,
        userId,
      ]
    );
    const receiptId = headerRes.insertId;

    // Insert items
    for (const item of validated.items) {
      await conn.execute(
        `INSERT INTO goods_receipt_items (goods_receipt_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)`,
        [receiptId, item.product_id, item.quantity.toFixed(4), item.unit_cost.toFixed(2)]
      );
    }

    return { id: receiptId, receipt_no: validated.receipt_no };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "inventory",
    entity: "goods_receipts",
    entity_id: result.id,
    new_values: { ...validated, company_id: companyId, status: "draft" },
  });

  return result;
}

/**
 * Post a goods receipt: changes status to 'posted' and records stock movements.
 * This is ATOMIC — if any stock movement fails, the whole thing rolls back.
 */
export async function postGoodsReceipt(
  session: UserSessionPayload | null,
  receiptId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const receipt = await assertGoodsReceiptAccess(session, receiptId);
  const userId = sessionUserId(session);

  if (receipt.status !== "draft") {
    throw new Error(`Cannot post receipt in status '${receipt.status}'.`);
  }

  // Load items
  const items = await query<GoodsReceiptItem[]>(
    `SELECT gri.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM goods_receipt_items gri
     JOIN products p ON gri.product_id = p.id
     WHERE gri.goods_receipt_id = ?`,
    [receiptId]
  );
  if (items.length === 0) throw new Error("Goods receipt tidak memiliki item.");

  await transaction(async (conn) => {
    // Update header status
    await conn.execute(
      "UPDATE goods_receipts SET status = 'posted' WHERE id = ?",
      [receiptId]
    );

    // Record RECEIPT movement for each item
    for (const item of items) {
      await recordMovement(
        conn,
        {
          company_id: receipt.company_id,
          warehouse_id: receipt.warehouse_id,
          product_id: item.product_id,
          transaction_type: "receipt",
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          reference_type: "goods_receipt",
          reference_id: receiptId,
          reference_number: receipt.receipt_no,
          notes: `Penerimaan barang ${receipt.receipt_no}`,
          created_by: userId,
        },
        false // no negative stock on receipt
      );
    }
  });

  await logAudit({
    user_id: userId,
    company_id: receipt.company_id,
    action: "POST",
    module: "inventory",
    entity: "goods_receipts",
    entity_id: receiptId,
    new_values: { status: "posted" },
  });
}

/**
 * Cancel a goods receipt (draft only).
 */
export async function cancelGoodsReceipt(
  session: UserSessionPayload | null,
  receiptId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const receipt = await assertGoodsReceiptAccess(session, receiptId);
  if (receipt.status !== "draft") {
    throw new Error("Hanya goods receipt berstatus 'draft' yang dapat dibatalkan.");
  }
  await execute("UPDATE goods_receipts SET status = 'cancelled' WHERE id = ?", [receiptId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: receipt.company_id,
    action: "CANCEL",
    module: "inventory",
    entity: "goods_receipts",
    entity_id: receiptId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List goods receipts for the authorized company.
 */
export async function listGoodsReceipts(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & { status?: string; warehouseId?: number; search?: string },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<GoodsReceipt>> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, warehouseId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["gr.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status) { conditions.push("gr.status = ?"); qp.push(status); }
  if (warehouseId) { conditions.push("gr.warehouse_id = ?"); qp.push(warehouseId); }
  if (search) { conditions.push("gr.receipt_no LIKE ?"); qp.push(`%${search}%`); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM goods_receipts gr WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<GoodsReceipt[]>(
    `SELECT gr.*, w.name AS warehouse_name, po.po_no,
            COALESCE(s_po.name, s_gr.name) AS supplier_name,
            (SELECT SUM(quantity) FROM goods_receipt_items WHERE goods_receipt_id = gr.id) AS total_items,
            (SELECT COUNT(*) FROM attachments WHERE reference_type = 'goods_receipt' AND reference_id = gr.id) AS attachment_count
     FROM goods_receipts gr
     JOIN warehouses w ON gr.warehouse_id = w.id
     LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     LEFT JOIN suppliers s_po ON po.supplier_id = s_po.id
     LEFT JOIN suppliers s_gr ON gr.supplier_id = s_gr.id
     WHERE ${where}
     ORDER BY gr.receipt_date DESC, gr.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get goods receipt by ID with its items.
 */
export async function getGoodsReceiptById(
  session: UserSessionPayload | null,
  receiptId: number
): Promise<{ receipt: GoodsReceipt; items: GoodsReceiptItem[] } | null> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const receipt = await assertGoodsReceiptAccess(session, receiptId);
  const items = await query<GoodsReceiptItem[]>(
    `SELECT gri.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM goods_receipt_items gri
     JOIN products p ON gri.product_id = p.id
     WHERE gri.goods_receipt_id = ?`,
    [receiptId]
  );
  return { receipt, items };
}
