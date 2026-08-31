/**
 * ERP Manajemen — Core Inventory Service
 *
 * CRITICAL: This is the ONLY place that may mutate stock_balances and
 * inventory_transactions. All receiving, issue, transfer, adjustment, and
 * opname operations MUST call recordMovement() inside a DB transaction.
 *
 * Architecture:
 *   UI → Server Action/API → Validation → Authorization
 *     → Domain Service → inventory-service.recordMovement()
 *     → DB Transaction (inventory_transactions + stock_balances)
 *     → Audit Log
 */

import { z } from "zod";
import { getConnection, query, queryOne } from "@/lib/db";
import {
  InventoryTransaction,
  InventoryTransactionType,
  StockBalance,
} from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import {
  resolveCompanyScope,
  assertEntityCompanyAccess,
} from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { PaginatedResult, PaginationParams } from "@/types/pagination";
import type { PoolConnection } from "mysql2/promise";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const RecordMovementSchema = z.object({
  company_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  transaction_type: z.enum([
    "receipt",
    "issue",
    "transfer_in",
    "transfer_out",
    "adjustment",
    "opening",
    "return_in",
    "return_out",
  ]),
  quantity: z.number().positive("Quantity must be positive"),
  unit_cost: z.number().min(0).default(0),
  reference_type: z.string().max(50).optional().nullable(),
  reference_id: z.number().int().positive().optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  created_by: z.number().int().positive().optional().nullable(),
  transaction_date: z.string().datetime().optional(), // ISO string; defaults to NOW()
});

export type RecordMovementInput = z.infer<typeof RecordMovementSchema>;

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Movement types that decrease stock (negative delta on stock_balances.quantity)
 */
const NEGATIVE_MOVEMENT_TYPES: InventoryTransactionType[] = [
  "issue",
  "transfer_out",
  "return_out",
];

// ─── Core Mutation ────────────────────────────────────────────────────────────

/**
 * Record a single inventory movement atomically.
 *
 * Steps (inside a single DB transaction):
 *  1. Lock the stock_balances row for the product/warehouse (SELECT ... FOR UPDATE)
 *  2. Compute new balance
 *  3. Reject if new balance < 0 and negative stock is not allowed
 *  4. Insert into inventory_transactions
 *  5. Upsert stock_balances (INSERT ... ON DUPLICATE KEY UPDATE)
 *
 * @param conn - An active PoolConnection with transaction already begun by the caller.
 *               If null, this function starts its own transaction.
 * @param input - Validated movement parameters (quantity must always be positive;
 *                direction is derived from transaction_type)
 * @param allowNegativeStock - Pass true only when business config permits it.
 * @returns The inserted inventory_transaction id
 */
export async function recordMovement(
  conn: PoolConnection | null,
  input: RecordMovementInput,
  allowNegativeStock = false
): Promise<number> {
  const validated = RecordMovementSchema.parse(input);
  const isNegative = NEGATIVE_MOVEMENT_TYPES.includes(
    validated.transaction_type
  );
  const quantityDelta = isNegative ? -validated.quantity : validated.quantity;

  const ownTransaction = conn === null;
  const connection: PoolConnection = ownTransaction
    ? await getConnection()
    : conn;

  try {
    if (ownTransaction) {
      await connection.beginTransaction();
    }

    // 1. Lock the stock_balances row (or get current 0 if it doesn't exist yet)
    const [rows] = await connection.execute<import("mysql2").RowDataPacket[]>(
      `SELECT quantity, average_cost FROM stock_balances
       WHERE company_id = ? AND warehouse_id = ? AND product_id = ?
       FOR UPDATE`,
      [validated.company_id, validated.warehouse_id, validated.product_id]
    );

    const currentQty: number =
      rows.length > 0 ? Number(rows[0].quantity) : 0;
    const currentAvgCost: number =
      rows.length > 0 ? Number(rows[0].average_cost) : 0;
    const newQty = currentQty + quantityDelta;

    // 2. Negative stock guard
    if (!allowNegativeStock && newQty < 0) {
      throw new Error(
        `Insufficient stock: current=${currentQty}, requested=${validated.quantity} (${validated.transaction_type})`
      );
    }

    // 3. Compute new weighted average cost (only for positive movements with a cost)
    let newAvgCost = currentAvgCost;
    if (isNegative === false && validated.unit_cost > 0) {
      const totalValue =
        currentQty * currentAvgCost + validated.quantity * validated.unit_cost;
      newAvgCost = newQty > 0 ? totalValue / newQty : validated.unit_cost;
    }

    // 4. Insert inventory_transaction
    const txDate =
      validated.transaction_date
        ? new Date(validated.transaction_date)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ")
        : null; // null → DB default = current_timestamp()

    const insertSql = txDate
      ? `INSERT INTO inventory_transactions
           (company_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, reference_number,
            quantity, unit_cost, transaction_date, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO inventory_transactions
           (company_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, reference_number,
            quantity, unit_cost, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const insertParams = txDate
      ? [
          validated.company_id,
          validated.warehouse_id,
          validated.product_id,
          validated.transaction_type,
          validated.reference_type ?? null,
          validated.reference_id ?? null,
          validated.reference_number ?? null,
          validated.quantity.toFixed(4),
          validated.unit_cost.toFixed(2),
          txDate,
          validated.notes ?? null,
          validated.created_by ?? null,
        ]
      : [
          validated.company_id,
          validated.warehouse_id,
          validated.product_id,
          validated.transaction_type,
          validated.reference_type ?? null,
          validated.reference_id ?? null,
          validated.reference_number ?? null,
          validated.quantity.toFixed(4),
          validated.unit_cost.toFixed(2),
          validated.notes ?? null,
          validated.created_by ?? null,
        ];

    const [txResult] = await connection.execute<import("mysql2").ResultSetHeader>(
      insertSql,
      insertParams
    );
    const txId = txResult.insertId;

    // 5. Upsert stock_balances (INSERT ... ON DUPLICATE KEY UPDATE)
    await connection.execute(
      `INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity, average_cost)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity = ?,
         average_cost = ?,
         updated_at = NOW()`,
      [
        validated.company_id,
        validated.warehouse_id,
        validated.product_id,
        newQty.toFixed(4),
        newAvgCost.toFixed(2),
        newQty.toFixed(4),
        newAvgCost.toFixed(2),
      ]
    );

    if (ownTransaction) {
      await connection.commit();
    }

    return txId;
  } catch (err) {
    if (ownTransaction) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (ownTransaction) {
      connection.release();
    }
  }
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get current stock balance for a specific product + warehouse.
 * Returns null if no balance record exists (treat as zero stock).
 */
export async function getStockBalance(
  session: UserSessionPayload | null,
  warehouseId: number,
  productId: number
): Promise<StockBalance | null> {
  requireAuth(session);

  const row = await queryOne<StockBalance>(
    `SELECT sb.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit,
            w.name AS warehouse_name
     FROM stock_balances sb
     JOIN products p ON sb.product_id = p.id
     JOIN warehouses w ON sb.warehouse_id = w.id
     WHERE sb.warehouse_id = ? AND sb.product_id = ?
     LIMIT 1`,
    [warehouseId, productId]
  );

  if (!row) return null;

  // Enforce company isolation
  assertEntityCompanyAccess(session, row.company_id);

  return row;
}

/**
 * List all stock balances for the authorized company, with optional filters.
 */
export async function listStockBalances(
  session: UserSessionPayload | null,
  params: PaginationParams & {
    warehouseId?: number;
    productId?: number;
    search?: string;
    belowMinimum?: boolean;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<StockBalance>> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const {
    page = 1,
    limit = 20,
    warehouseId,
    productId,
    search,
    belowMinimum,
  } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["sb.company_id = ?"];
  const queryParams: (string | number | boolean)[] = [companyId];

  if (warehouseId) {
    conditions.push("sb.warehouse_id = ?");
    queryParams.push(warehouseId);
  }
  if (productId) {
    conditions.push("sb.product_id = ?");
    queryParams.push(productId);
  }
  if (search) {
    conditions.push("(p.name LIKE ? OR p.sku LIKE ?)");
    queryParams.push(`%${search}%`, `%${search}%`);
  }
  if (belowMinimum) {
    conditions.push("sb.quantity < p.minimum_stock");
  }

  const where = conditions.join(" AND ");

  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM stock_balances sb
     JOIN products p ON sb.product_id = p.id
     WHERE ${where}`,
    queryParams
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<StockBalance[]>(
    `SELECT sb.*, p.name AS product_name, p.sku AS product_sku,
            p.unit AS product_unit, p.minimum_stock,
            w.name AS warehouse_name,
            (SELECT SUM(quantity) FROM inventory_transactions
             WHERE product_id = sb.product_id AND company_id = sb.company_id
             AND transaction_type IN ('receipt', 'opening')) AS total_received
     FROM stock_balances sb
     JOIN products p ON sb.product_id = p.id
     JOIN warehouses w ON sb.warehouse_id = w.id
     WHERE ${where}
     ORDER BY w.name ASC, p.name ASC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
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

/**
 * List inventory movement history for the authorized company.
 */
export async function listMovements(
  session: UserSessionPayload | null,
  params: PaginationParams & {
    warehouseId?: number;
    productId?: number;
    transactionType?: InventoryTransactionType;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<InventoryTransaction>> {
  requirePermission(session, PERMISSIONS.INVENTORY_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const { page = 1, limit = 30, warehouseId, productId, transactionType, dateFrom, dateTo, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["it.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (warehouseId) { conditions.push("it.warehouse_id = ?"); qp.push(warehouseId); }
  if (productId) { conditions.push("it.product_id = ?"); qp.push(productId); }
  if (transactionType) { conditions.push("it.transaction_type = ?"); qp.push(transactionType); }
  if (dateFrom) { conditions.push("it.transaction_date >= ?"); qp.push(dateFrom); }
  if (dateTo) { conditions.push("it.transaction_date <= ?"); qp.push(dateTo + " 23:59:59"); }
  if (search) { conditions.push("(p.name LIKE ? OR p.sku LIKE ?)"); qp.push(`%${search}%`, `%${search}%`); }

  const where = conditions.join(" AND ");

  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM inventory_transactions it
     JOIN products p ON it.product_id = p.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<InventoryTransaction[]>(
    `SELECT it.*, p.name AS product_name, p.sku AS product_sku,
            w.name AS warehouse_name,
            CASE
              WHEN it.reference_type = 'goods_receipt' THEN (
                SELECT COALESCE(s_po.name, s_gr.name) FROM goods_receipts gr
                LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
                LEFT JOIN suppliers s_po ON po.supplier_id = s_po.id
                LEFT JOIN suppliers s_gr ON gr.supplier_id = s_gr.id
                WHERE gr.id = it.reference_id
                LIMIT 1
              )
              WHEN it.reference_type = 'delivery_order' THEN (
                SELECT c.name FROM deliveries d
                JOIN sales_orders so ON d.sales_order_id = so.id
                JOIN customers c ON so.customer_id = c.id
                WHERE d.id = it.reference_id
                LIMIT 1
              )
              ELSE NULL
            END AS mitra_name
     FROM inventory_transactions it
     JOIN products p ON it.product_id = p.id
     JOIN warehouses w ON it.warehouse_id = w.id
     WHERE ${where}
     ORDER BY it.transaction_date DESC, it.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Record a signed (positive or negative) stock change — used by adjustments.
 * Internally determines direction from the sign of quantityDelta.
 * Positive delta → "adjustment" (treated as in-stock increase)
 * Negative delta → "issue"     (treated as stock decrease)
 *
 * @param conn - Active PoolConnection already in a transaction
 */
export async function recordSignedMovement(
  conn: PoolConnection,
  params: {
    company_id: number;
    warehouse_id: number;
    product_id: number;
    quantity_delta: number; // can be negative
    reference_type?: string | null;
    reference_id?: number | null;
    reference_number?: string | null;
    notes?: string | null;
    created_by?: number | null;
  },
  allowNegativeStock = false
): Promise<number> {
  const { quantity_delta, ...rest } = params;
  if (quantity_delta === 0) throw new Error("quantity_delta must not be zero.");

  const transactionType: InventoryTransactionType =
    quantity_delta > 0 ? "adjustment" : "issue";

  return recordMovement(
    conn,
    {
      ...rest,
      transaction_type: transactionType,
      quantity: Math.abs(quantity_delta),
      unit_cost: 0,
    },
    allowNegativeStock
  );
}

