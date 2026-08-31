/**
 * ERP Manajemen — Sales Order (SO) Service
 *
 * Workflow:
 *   draft → confirmed → partial / delivered → invoiced → closed / cancelled
 *
 * Enforces server-side financial calculations (subtotal, tax, total),
 * atomic header + items creation, and company isolation.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { SalesOrder, SalesItem, SalesOrderStatus } from "@/types";
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

const SalesItemInputSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0"),
  unit_price: z.number().min(0, "Harga satuan tidak boleh negatif"),
  tax_rate: z.number().min(0).max(100).default(0), // percentage e.g. 11% PPN
});

export const SalesOrderSchema = z.object({
  customer_id: z.number().int().positive("Pelanggan wajib dipilih"),
  branch_id: z.number().int().positive().optional().nullable(),
  order_no: z.string().min(3).max(50),
  order_date: z.string().min(1), // "YYYY-MM-DD"
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(SalesItemInputSchema).min(1, "Minimal harus ada 1 item pesanan"),
});

export type SalesOrderInput = z.infer<typeof SalesOrderSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertSalesOrderAccess(
  session: UserSessionPayload | null,
  orderId: number
): Promise<SalesOrder> {
  const so = await queryOne<SalesOrder>(
    `SELECT so.*, c.name AS customer_name, c.code AS customer_code, b.name AS branch_name
     FROM sales_orders so
     JOIN customers c ON so.customer_id = c.id
     LEFT JOIN branches b ON so.branch_id = b.id
     WHERE so.id = ?`,
    [orderId]
  );
  if (!so) throw new Error("Sales Order tidak ditemukan.");
  assertEntityCompanyAccess(session, so.company_id);
  return so;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Sales Order in DRAFT status.
 * Calculates financial totals server-side and writes header + items atomically.
 */
export async function createSalesOrder(
  session: UserSessionPayload | null,
  input: SalesOrderInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; order_no: string; total_amount: number }> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = SalesOrderSchema.parse(input);
  const userId = sessionUserId(session);

  // Check duplicate order_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM sales_orders WHERE company_id = ? AND order_no = ? LIMIT 1",
    [companyId, validated.order_no]
  );
  if (existing) {
    throw new Error(`Nomor Pesanan '${validated.order_no}' sudah digunakan.`);
  }

  // Verify customer belongs to company & active
  const customer = await queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM customers WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.customer_id, companyId]
  );
  if (!customer) throw new Error("Pelanggan tidak ditemukan atau akses ditolak.");
  if (customer.status !== "active") throw new Error("Pelanggan tidak aktif.");

  // Verify all products belong to company & active
  const productIds = validated.items.map((i) => i.product_id);
  const products = await query<{ id: number; name: string }[]>(
    `SELECT id, name FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) AND company_id = ? AND status = 'active'`,
    [...productIds, companyId]
  );
  if (products.length !== productIds.length) {
    throw new Error("Satu atau lebih produk tidak ditemukan atau tidak aktif di perusahaan ini.");
  }

  // Calculate items and totals server-side
  let calculatedSubtotal = 0;
  let calculatedTax = 0;

  const processedItems = validated.items.map((item) => {
    const lineSubtotal = item.quantity * item.unit_price;
    const lineTax = (lineSubtotal * (item.tax_rate || 0)) / 100;
    const lineTotal = lineSubtotal + lineTax;

    calculatedSubtotal += lineSubtotal;
    calculatedTax += lineTax;

    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_amount: lineTax,
      total_amount: lineTotal,
    };
  });

  const calculatedTotal = calculatedSubtotal + calculatedTax;

  const result = await transaction(async (conn) => {
    // 1. Insert header
    const [headerRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO sales_orders
         (company_id, customer_id, branch_id, order_no, order_date,
          status, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        companyId,
        validated.customer_id,
        validated.branch_id ?? null,
        validated.order_no,
        validated.order_date,
        calculatedSubtotal.toFixed(2),
        calculatedTax.toFixed(2),
        calculatedTotal.toFixed(2),
        validated.notes ?? null,
        userId,
      ]
    );
    const soId = headerRes.insertId;

    // 2. Insert items
    for (const item of processedItems) {
      await conn.execute(
        `INSERT INTO sales_items
           (sales_order_id, product_id, quantity, unit_price, tax_amount, total_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          soId,
          item.product_id,
          item.quantity.toFixed(4),
          item.unit_price.toFixed(2),
          item.tax_amount.toFixed(2),
          item.total_amount.toFixed(2),
        ]
      );
    }

    return { id: soId, order_no: validated.order_no, total_amount: calculatedTotal };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "sales",
    entity: "sales_orders",
    entity_id: result.id,
    new_values: {
      ...validated,
      subtotal: calculatedSubtotal,
      tax_amount: calculatedTax,
      total_amount: calculatedTotal,
      status: "draft",
    },
  });

  return result;
}

/**
 * Confirm Sales Order: draft → confirmed
 */
export async function confirmSalesOrder(
  session: UserSessionPayload | null,
  orderId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const so = await assertSalesOrderAccess(session, orderId);
  if (so.status !== "draft") {
    throw new Error(`Hanya draft Sales Order yang dapat dikonfirmasi (status saat ini: '${so.status}').`);
  }

  await execute("UPDATE sales_orders SET status = 'confirmed' WHERE id = ?", [orderId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: so.company_id,
    action: "CONFIRM",
    module: "sales",
    entity: "sales_orders",
    entity_id: orderId,
    new_values: { status: "confirmed" },
  });
}

/**
 * Cancel Sales Order: draft/confirmed → cancelled
 */
export async function cancelSalesOrder(
  session: UserSessionPayload | null,
  orderId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const so = await assertSalesOrderAccess(session, orderId);
  if (["delivered", "invoiced", "closed", "cancelled"].includes(so.status)) {
    throw new Error(`Sales Order dengan status '${so.status}' tidak dapat dibatalkan.`);
  }

  await execute("UPDATE sales_orders SET status = 'cancelled' WHERE id = ?", [orderId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: so.company_id,
    action: "CANCEL",
    module: "sales",
    entity: "sales_orders",
    entity_id: orderId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List Sales Orders with pagination and filters.
 */
export async function listSalesOrders(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: SalesOrderStatus | "all";
    customerId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<SalesOrder>> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, customerId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["so.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("so.status = ?"); qp.push(status); }
  if (customerId) { conditions.push("so.customer_id = ?"); qp.push(customerId); }
  if (search) {
    conditions.push("(so.order_no LIKE ? OR c.name LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM sales_orders so
     JOIN customers c ON so.customer_id = c.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<SalesOrder[]>(
    `SELECT so.*, c.name AS customer_name, c.code AS customer_code, b.name AS branch_name
     FROM sales_orders so
     JOIN customers c ON so.customer_id = c.id
     LEFT JOIN branches b ON so.branch_id = b.id
     WHERE ${where}
     ORDER BY so.order_date DESC, so.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Sales Order by ID along with its line items.
 */
export async function getSalesOrderById(
  session: UserSessionPayload | null,
  orderId: number
): Promise<{ order: SalesOrder; items: SalesItem[] } | null> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const order = await assertSalesOrderAccess(session, orderId);

  const items = await query<SalesItem[]>(
    `SELECT si.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM sales_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.sales_order_id = ?`,
    [orderId]
  );

  return { order, items };
}
