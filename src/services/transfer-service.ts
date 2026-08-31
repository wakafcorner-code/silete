/**
 * ERP Manajemen — Warehouse Transfer Service
 *
 * CRITICAL: Transfer is atomic.
 * TRANSFER_OUT from source AND TRANSFER_IN to destination
 * must both succeed or both fail inside a single DB transaction.
 *
 * Both warehouses must belong to the SAME company.
 */

import { z } from "zod";
import { transaction, query, queryOne } from "@/lib/db";
import { InventoryTransaction } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission } from "@/services/rbac-service";
import {
  resolveCompanyScope,
} from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { recordMovement } from "@/services/inventory-service";
import { logAudit } from "@/services/audit-service";
import { PaginatedResult, PaginationParams } from "@/types/pagination";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const TransferSchema = z.object({
  source_warehouse_id: z.number().int().positive(),
  destination_warehouse_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  quantity: z.number().positive("Quantity must be positive"),
  notes: z.string().max(500).optional().nullable(),
}).refine(
  (d) => d.source_warehouse_id !== d.destination_warehouse_id,
  { message: "Source dan destination warehouse tidak boleh sama." }
);

export type TransferInput = z.infer<typeof TransferSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create and immediately post a warehouse-to-warehouse transfer.
 *
 * Steps (single DB transaction):
 *  1. TRANSFER_OUT from source warehouse (negative stock guard)
 *  2. TRANSFER_IN  to destination warehouse
 *  Both inventory_transactions written, both stock_balances updated.
 *
 * Returns the IDs of both inventory_transaction records.
 */
export async function createWarehouseTransfer(
  session: UserSessionPayload | null,
  input: TransferInput,
  requestedCompanyId?: number | string | null
): Promise<{ transfer_out_tx_id: number; transfer_in_tx_id: number }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = TransferSchema.parse(input);
  const userId = sessionUserId(session);

  // Verify BOTH warehouses belong to the resolved company
  const srcWarehouse = await queryOne<{ id: number; name: string }>(
    "SELECT id, name FROM warehouses WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.source_warehouse_id, companyId]
  );
  if (!srcWarehouse) {
    throw new Error("Gudang sumber tidak ditemukan atau bukan milik perusahaan ini.");
  }

  const dstWarehouse = await queryOne<{ id: number; name: string }>(
    "SELECT id, name FROM warehouses WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.destination_warehouse_id, companyId]
  );
  if (!dstWarehouse) {
    throw new Error("Gudang tujuan tidak ditemukan atau bukan milik perusahaan ini.");
  }

  // Verify product belongs to company
  const product = await queryOne<{ id: number; name: string; sku: string }>(
    "SELECT id, name, sku FROM products WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.product_id, companyId]
  );
  if (!product) {
    throw new Error("Produk tidak ditemukan atau tidak aktif.");
  }

  const notes = validated.notes
    ?? `Transfer ${srcWarehouse.name} → ${dstWarehouse.name}`;

  const result = await transaction(async (conn) => {
    // 1. TRANSFER_OUT — negative stock guard enforced (allowNegativeStock = false)
    const outTxId = await recordMovement(
      conn,
      {
        company_id: companyId,
        warehouse_id: validated.source_warehouse_id,
        product_id: validated.product_id,
        transaction_type: "transfer_out",
        quantity: validated.quantity,
        unit_cost: 0,
        reference_type: "warehouse_transfer",
        reference_id: null, // no transfer header table in schema
        notes,
        created_by: userId,
      },
      false // prevent negative source stock
    );

    // 2. TRANSFER_IN — no negative stock issue (adding to destination)
    const inTxId = await recordMovement(
      conn,
      {
        company_id: companyId,
        warehouse_id: validated.destination_warehouse_id,
        product_id: validated.product_id,
        transaction_type: "transfer_in",
        quantity: validated.quantity,
        unit_cost: 0,
        reference_type: "warehouse_transfer",
        reference_id: outTxId, // link to the OUT transaction
        notes,
        created_by: userId,
      },
      false
    );

    return { transfer_out_tx_id: outTxId, transfer_in_tx_id: inTxId };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "TRANSFER",
    module: "inventory",
    entity: "inventory_transactions",
    entity_id: result.transfer_out_tx_id,
    new_values: {
      source_warehouse_id: validated.source_warehouse_id,
      destination_warehouse_id: validated.destination_warehouse_id,
      product_id: validated.product_id,
      quantity: validated.quantity,
      out_tx_id: result.transfer_out_tx_id,
      in_tx_id: result.transfer_in_tx_id,
    },
  });

  return result;
}

/**
 * List recent transfer movements for the authorized company.
 * Returns TRANSFER_OUT entries (paired with TRANSFER_IN via reference_id).
 */
export async function listTransfers(
  session: UserSessionPayload | null,
  params: PaginationParams & {
    warehouseId?: number;
    productId?: number;
    dateFrom?: string;
    dateTo?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<InventoryTransaction>> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, warehouseId, productId, dateFrom, dateTo } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = [
    "it.company_id = ?",
    "it.transaction_type IN ('transfer_out', 'transfer_in')",
  ];
  const qp: (string | number)[] = [companyId];

  if (warehouseId) { conditions.push("it.warehouse_id = ?"); qp.push(warehouseId); }
  if (productId)   { conditions.push("it.product_id = ?"); qp.push(productId); }
  if (dateFrom)    { conditions.push("it.transaction_date >= ?"); qp.push(dateFrom); }
  if (dateTo)      { conditions.push("it.transaction_date <= ?"); qp.push(dateTo + " 23:59:59"); }

  const where = conditions.join(" AND ");

  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM inventory_transactions it WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<InventoryTransaction[]>(
    `SELECT it.*, p.name AS product_name, p.sku AS product_sku, w.name AS warehouse_name
     FROM inventory_transactions it
     JOIN products p ON it.product_id = p.id
     JOIN warehouses w ON it.warehouse_id = w.id
     WHERE ${where}
     ORDER BY it.transaction_date DESC, it.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
