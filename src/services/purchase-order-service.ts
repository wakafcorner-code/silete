/**
 * ERP Manajemen — Purchase Order (PO) Service
 *
 * Workflow:
 *   draft → submitted → approved → partial / received → closed / cancelled
 *
 * Enforces server-side financial calculations (subtotal, tax, total),
 * atomic header + items creation, and company isolation.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { PurchaseOrder, PurchaseItem, PurchaseOrderStatus } from "@/types";
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

const PurchaseItemInputSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0"),
  unit_price: z.number().min(0, "Harga satuan tidak boleh negatif"),
  tax_rate: z.number().min(0).max(100).default(0), // percentage e.g. 11% PPN
});

export const PurchaseOrderSchema = z.object({
  supplier_id: z.number().int().positive("Supplier wajib dipilih"),
  purchase_request_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  po_no: z.string().min(3).max(50),
  order_date: z.string().min(1), // "YYYY-MM-DD"
  expected_date: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(PurchaseItemInputSchema).min(1, "Minimal harus ada 1 item barang"),
});

export type PurchaseOrderInput = z.infer<typeof PurchaseOrderSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertPurchaseOrderAccess(
  session: UserSessionPayload | null,
  poId: number
): Promise<PurchaseOrder> {
  const po = await queryOne<PurchaseOrder>(
    `SELECT po.*, s.name AS supplier_name, s.code AS supplier_code, b.name AS branch_name
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN branches b ON po.branch_id = b.id
     WHERE po.id = ?`,
    [poId]
  );
  if (!po) throw new Error("Purchase Order tidak ditemukan.");
  assertEntityCompanyAccess(session, po.company_id);
  return po;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Purchase Order in DRAFT status.
 * Calculates financial totals server-side and writes header + items atomically.
 */
export async function createPurchaseOrder(
  session: UserSessionPayload | null,
  input: PurchaseOrderInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; po_no: string; total_amount: number }> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = PurchaseOrderSchema.parse(input);
  const userId = sessionUserId(session);

  // Check duplicate po_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM purchase_orders WHERE company_id = ? AND po_no = ? LIMIT 1",
    [companyId, validated.po_no]
  );
  if (existing) {
    throw new Error(`Nomor PO '${validated.po_no}' sudah digunakan.`);
  }

  // Verify supplier belongs to company
  const supplier = await queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM suppliers WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.supplier_id, companyId]
  );
  if (!supplier) throw new Error("Supplier tidak ditemukan atau akses ditolak.");
  if (supplier.status !== "active") throw new Error("Supplier tidak aktif.");

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
      `INSERT INTO purchase_orders
         (company_id, supplier_id, purchase_request_id, branch_id, po_no, order_date, expected_date,
          status, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        companyId,
        validated.supplier_id,
        validated.purchase_request_id ?? null,
        validated.branch_id ?? null,
        validated.po_no,
        validated.order_date,
        validated.expected_date ?? null,
        calculatedSubtotal.toFixed(2),
        calculatedTax.toFixed(2),
        calculatedTotal.toFixed(2),
        validated.notes ?? null,
        userId,
      ]
    );
    const poId = headerRes.insertId;

    // 2. Insert items
    for (const item of processedItems) {
      await conn.execute(
        `INSERT INTO purchase_items
           (purchase_order_id, product_id, quantity, unit_price, tax_amount, total_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          poId,
          item.product_id,
          item.quantity.toFixed(4),
          item.unit_price.toFixed(2),
          item.tax_amount.toFixed(2),
          item.total_amount.toFixed(2),
        ]
      );
    }

    return { id: poId, po_no: validated.po_no, total_amount: calculatedTotal };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "purchasing",
    entity: "purchase_orders",
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
 * Approve Purchase Order: draft/submitted → approved
 */
export async function approvePurchaseOrder(
  session: UserSessionPayload | null,
  poId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const po = await assertPurchaseOrderAccess(session, poId);
  if (po.status !== "draft" && po.status !== "submitted") {
    throw new Error(`Status PO '${po.status}' tidak valid untuk disetujui.`);
  }

  await execute("UPDATE purchase_orders SET status = 'approved' WHERE id = ?", [poId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: po.company_id,
    action: "APPROVE",
    module: "purchasing",
    entity: "purchase_orders",
    entity_id: poId,
    new_values: { status: "approved" },
  });
}

/**
 * Cancel Purchase Order: draft/submitted/approved → cancelled
 */
export async function cancelPurchaseOrder(
  session: UserSessionPayload | null,
  poId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const po = await assertPurchaseOrderAccess(session, poId);
  if (["received", "closed", "cancelled"].includes(po.status)) {
    throw new Error(`PO dengan status '${po.status}' tidak dapat dibatalkan.`);
  }

  await execute("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?", [poId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: po.company_id,
    action: "CANCEL",
    module: "purchasing",
    entity: "purchase_orders",
    entity_id: poId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List Purchase Orders with pagination and filters.
 */
export async function listPurchaseOrders(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: PurchaseOrderStatus | "all";
    supplierId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<PurchaseOrder>> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, supplierId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["po.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("po.status = ?"); qp.push(status); }
  if (supplierId) { conditions.push("po.supplier_id = ?"); qp.push(supplierId); }
  if (search) {
    conditions.push("(po.po_no LIKE ? OR s.name LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<PurchaseOrder[]>(
    `SELECT po.*, s.name AS supplier_name, s.code AS supplier_code, b.name AS branch_name
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN branches b ON po.branch_id = b.id
     WHERE ${where}
     ORDER BY po.order_date DESC, po.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Purchase Order by ID along with its line items.
 */
export async function getPurchaseOrderById(
  session: UserSessionPayload | null,
  poId: number
): Promise<{ order: PurchaseOrder; items: PurchaseItem[] } | null> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const order = await assertPurchaseOrderAccess(session, poId);

  const items = await query<PurchaseItem[]>(
    `SELECT pi.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM purchase_items pi
     JOIN products p ON pi.product_id = p.id
     WHERE pi.purchase_order_id = ?`,
    [poId]
  );

  return { order, items };
}
