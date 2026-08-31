/**
 * ERP Manajemen — Delivery Order (DO) Service
 *
 * Workflow:
 *   draft → posted (reduces physical stock atomically via ISSUE) → cancelled
 *
 * CRITICAL:
 *   Posting a delivery reduces physical stock from the selected warehouse
 *   via `recordMovement(issue)` inside an atomic DB transaction with row locking.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { Delivery, DeliveryItem, DeliveryStatus } from "@/types";
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

const DeliveryItemInputSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive("Kuantitas pengiriman harus lebih dari 0"),
});

export const DeliverySchema = z.object({
  sales_order_id: z.number().int().positive().optional().nullable(),
  warehouse_id: z.number().int().positive("Gudang asal pengiriman wajib dipilih"),
  delivery_no: z.string().min(3).max(50),
  delivery_date: z.string().min(1), // "YYYY-MM-DD"
  items: z.array(DeliveryItemInputSchema).min(1, "Minimal harus ada 1 item yang dikirim"),
});

export type DeliveryInput = z.infer<typeof DeliverySchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertDeliveryAccess(
  session: UserSessionPayload | null,
  deliveryId: number
): Promise<Delivery> {
  const delivery = await queryOne<Delivery>(
    `SELECT d.*, w.name AS warehouse_name, so.order_no, c.name AS customer_name
     FROM deliveries d
     JOIN warehouses w ON d.warehouse_id = w.id
     LEFT JOIN sales_orders so ON d.sales_order_id = so.id
     LEFT JOIN customers c ON so.customer_id = c.id
     WHERE d.id = ?`,
    [deliveryId]
  );
  if (!delivery) throw new Error("Surat Jalan / Pengiriman tidak ditemukan.");
  assertEntityCompanyAccess(session, delivery.company_id);
  return delivery;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Delivery in DRAFT status.
 */
export async function createDelivery(
  session: UserSessionPayload | null,
  input: DeliveryInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; delivery_no: string }> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = DeliverySchema.parse(input);
  const userId = sessionUserId(session);

  // Check duplicate delivery_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM deliveries WHERE company_id = ? AND delivery_no = ? LIMIT 1",
    [companyId, validated.delivery_no]
  );
  if (existing) {
    throw new Error(`Nomor Surat Jalan '${validated.delivery_no}' sudah digunakan.`);
  }

  // Verify warehouse belongs to company & active
  const warehouse = await queryOne<{ id: number }>(
    "SELECT id FROM warehouses WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.warehouse_id, companyId]
  );
  if (!warehouse) throw new Error("Gudang tidak ditemukan atau bukan milik perusahaan ini.");

  // If sales_order_id provided, verify it belongs to company
  if (validated.sales_order_id) {
    const so = await queryOne<{ id: number; status: string }>(
      "SELECT id, status FROM sales_orders WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.sales_order_id, companyId]
    );
    if (!so) throw new Error("Sales Order tidak ditemukan atau bukan milik perusahaan ini.");
  }

  const result = await transaction(async (conn) => {
    // 1. Insert header
    const [headerRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO deliveries
         (company_id, sales_order_id, warehouse_id, delivery_no, delivery_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
      [
        companyId,
        validated.sales_order_id ?? null,
        validated.warehouse_id,
        validated.delivery_no,
        validated.delivery_date,
        userId,
      ]
    );
    const deliveryId = headerRes.insertId;

    // 2. Insert items
    for (const item of validated.items) {
      await conn.execute(
        `INSERT INTO delivery_items (delivery_id, product_id, quantity)
         VALUES (?, ?, ?)`,
        [deliveryId, item.product_id, item.quantity.toFixed(4)]
      );
    }

    return { id: deliveryId, delivery_no: validated.delivery_no };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "sales",
    entity: "deliveries",
    entity_id: result.id,
    new_values: { ...validated, status: "draft" },
  });

  return result;
}

/**
 * Post Delivery: updates status to 'posted', reduces stock atomically via inventory-service.
 */
export async function postDelivery(
  session: UserSessionPayload | null,
  deliveryId: number,
  allowNegativeStock = false
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const delivery = await assertDeliveryAccess(session, deliveryId);
  const userId = sessionUserId(session);

  if (delivery.status !== "draft") {
    throw new Error(`Pengiriman dengan status '${delivery.status}' tidak dapat diposting.`);
  }

  // Load delivery items
  const items = await query<DeliveryItem[]>(
    `SELECT di.*, p.name AS product_name, p.sku AS product_sku
     FROM delivery_items di
     JOIN products p ON di.product_id = p.id
     WHERE di.delivery_id = ?`,
    [deliveryId]
  );
  if (items.length === 0) throw new Error("Surat Jalan tidak memiliki item pengiriman.");

  await transaction(async (conn) => {
    // 1. Update delivery status
    await conn.execute("UPDATE deliveries SET status = 'posted' WHERE id = ?", [deliveryId]);

    // 2. Record ISSUE movements for each product to reduce stock
    for (const item of items) {
      await recordMovement(
        conn,
        {
          company_id: delivery.company_id,
          warehouse_id: delivery.warehouse_id,
          product_id: item.product_id,
          transaction_type: "issue",
          quantity: Number(item.quantity),
          unit_cost: 0,
          reference_type: "delivery_order",
          reference_id: deliveryId,
          reference_number: delivery.delivery_no,
          notes: `Pengiriman barang ${delivery.delivery_no}`,
          created_by: userId,
        },
        allowNegativeStock // false enforces negative stock guard
      );
    }

    // 3. Update Sales Order status if linked
    if (delivery.sales_order_id) {
      await conn.execute("UPDATE sales_orders SET status = 'delivered' WHERE id = ?", [
        delivery.sales_order_id,
      ]);
    }
  });

  await logAudit({
    user_id: userId,
    company_id: delivery.company_id,
    action: "POST",
    module: "sales",
    entity: "deliveries",
    entity_id: deliveryId,
    new_values: { status: "posted" },
  });
}

/**
 * Cancel Delivery: draft → cancelled
 */
export async function cancelDelivery(
  session: UserSessionPayload | null,
  deliveryId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const delivery = await assertDeliveryAccess(session, deliveryId);
  if (delivery.status !== "draft") {
    throw new Error("Hanya Surat Jalan berstatus 'draft' yang dapat dibatalkan.");
  }

  await execute("UPDATE deliveries SET status = 'cancelled' WHERE id = ?", [deliveryId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: delivery.company_id,
    action: "CANCEL",
    module: "sales",
    entity: "deliveries",
    entity_id: deliveryId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List Deliveries with pagination and filters.
 */
export async function listDeliveries(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: DeliveryStatus | "all";
    warehouseId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Delivery>> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, warehouseId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["d.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("d.status = ?"); qp.push(status); }
  if (warehouseId) { conditions.push("d.warehouse_id = ?"); qp.push(warehouseId); }
  if (search) {
    conditions.push("(d.delivery_no LIKE ? OR so.order_no LIKE ? OR c.name LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM deliveries d
     LEFT JOIN sales_orders so ON d.sales_order_id = so.id
     LEFT JOIN customers c ON so.customer_id = c.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Delivery[]>(
    `SELECT d.*, w.name AS warehouse_name, so.order_no, c.name AS customer_name
     FROM deliveries d
     JOIN warehouses w ON d.warehouse_id = w.id
     LEFT JOIN sales_orders so ON d.sales_order_id = so.id
     LEFT JOIN customers c ON so.customer_id = c.id
     WHERE ${where}
     ORDER BY d.delivery_date DESC, d.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Delivery by ID along with its line items.
 */
export async function getDeliveryById(
  session: UserSessionPayload | null,
  deliveryId: number
): Promise<{ delivery: Delivery; items: DeliveryItem[] } | null> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const delivery = await assertDeliveryAccess(session, deliveryId);

  const items = await query<DeliveryItem[]>(
    `SELECT di.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM delivery_items di
     JOIN products p ON di.product_id = p.id
     WHERE di.delivery_id = ?`,
    [deliveryId]
  );

  return { delivery, items };
}
