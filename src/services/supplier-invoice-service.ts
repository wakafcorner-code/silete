/**
 * ERP Manajemen — Supplier Invoice & Accounts Payable (AP) Service
 *
 * Workflow:
 *   draft → posted (creates AP record atomically) → paid / cancelled
 *
 * CRITICAL:
 *   Posting an invoice atomically inserts an Accounts Payable (AP) record
 *   into `payables` with outstanding balance = total_amount.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { Invoice, InvoiceItem, Payable, InvoiceStatus, PayableStatus } from "@/types";
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

const InvoiceItemInputSchema = z.object({
  product_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0"),
  unit_price: z.number().min(0, "Harga satuan tidak boleh negatif"),
  tax_amount: z.number().min(0).default(0),
});

export const SupplierInvoiceSchema = z.object({
  supplier_id: z.number().int().positive("Supplier wajib dipilih"),
  purchase_order_id: z.number().int().positive().optional().nullable(),
  invoice_no: z.string().min(3).max(50),
  invoice_date: z.string().min(1), // "YYYY-MM-DD"
  due_date: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(InvoiceItemInputSchema).min(1, "Minimal harus ada 1 baris item faktur"),
});

export type SupplierInvoiceInput = z.infer<typeof SupplierInvoiceSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertInvoiceAccess(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<Invoice> {
  const inv = await queryOne<Invoice>(
    `SELECT inv.*, s.name AS supplier_name
     FROM invoices inv
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     WHERE inv.id = ? AND inv.invoice_type = 'purchase'`,
    [invoiceId]
  );
  if (!inv) throw new Error("Faktur Pembelian tidak ditemukan.");
  assertEntityCompanyAccess(session, inv.company_id);
  return inv;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Supplier Invoice in DRAFT status.
 * Calculates financial totals server-side and writes header + items atomically.
 */
export async function createSupplierInvoice(
  session: UserSessionPayload | null,
  input: SupplierInvoiceInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; invoice_no: string; total_amount: number }> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = SupplierInvoiceSchema.parse(input);
  const userId = sessionUserId(session);

  // Prevent duplicate invoice_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM invoices WHERE company_id = ? AND invoice_no = ? AND invoice_type = 'purchase' LIMIT 1",
    [companyId, validated.invoice_no]
  );
  if (existing) {
    throw new Error(`Nomor Faktur '${validated.invoice_no}' sudah digunakan.`);
  }

  // Verify supplier belongs to company
  const supplier = await queryOne<{ id: number }>(
    "SELECT id FROM suppliers WHERE id = ? AND company_id = ? AND status = 'active' LIMIT 1",
    [validated.supplier_id, companyId]
  );
  if (!supplier) throw new Error("Supplier tidak ditemukan atau tidak aktif.");

  // If purchase_order_id provided, verify it belongs to company
  if (validated.purchase_order_id) {
    const po = await queryOne<{ id: number }>(
      "SELECT id FROM purchase_orders WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.purchase_order_id, companyId]
    );
    if (!po) throw new Error("Purchase Order tidak valid untuk perusahaan ini.");
  }

  // Calculate items and totals server-side
  let calculatedSubtotal = 0;
  let calculatedTax = 0;

  const processedItems = validated.items.map((item) => {
    const lineSubtotal = item.quantity * item.unit_price;
    const lineTax = item.tax_amount || 0;
    const lineTotal = lineSubtotal + lineTax;

    calculatedSubtotal += lineSubtotal;
    calculatedTax += lineTax;

    return {
      product_id: item.product_id ?? null,
      description: item.description ?? null,
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
      `INSERT INTO invoices
         (company_id, supplier_id, purchase_order_id, invoice_no, invoice_type,
          invoice_date, due_date, status, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, 'purchase', ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        companyId,
        validated.supplier_id,
        validated.purchase_order_id ?? null,
        validated.invoice_no,
        validated.invoice_date,
        validated.due_date ?? null,
        calculatedSubtotal.toFixed(2),
        calculatedTax.toFixed(2),
        calculatedTotal.toFixed(2),
        validated.notes ?? null,
        userId,
      ]
    );
    const invoiceId = headerRes.insertId;

    // 2. Insert items
    for (const item of processedItems) {
      await conn.execute(
        `INSERT INTO invoice_items
           (invoice_id, product_id, description, quantity, unit_price, tax_amount, total_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.product_id,
          item.description,
          item.quantity.toFixed(4),
          item.unit_price.toFixed(2),
          item.tax_amount.toFixed(2),
          item.total_amount.toFixed(2),
        ]
      );
    }

    return { id: invoiceId, invoice_no: validated.invoice_no, total_amount: calculatedTotal };
  });

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "purchasing",
    entity: "invoices",
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
 * Post Supplier Invoice: status → posted AND creates Accounts Payable (AP) record atomically.
 */
export async function postSupplierInvoice(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<{ payable_id: number }> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const inv = await assertInvoiceAccess(session, invoiceId);
  const userId = sessionUserId(session);

  if (inv.status !== "draft") {
    throw new Error(`Faktur dengan status '${inv.status}' tidak dapat diposting.`);
  }

  const totalAmount = Number(inv.total_amount);
  if (totalAmount <= 0) {
    throw new Error("Total faktur harus lebih dari 0.");
  }
  if (!inv.supplier_id) {
    throw new Error("Supplier ID tidak valid pada faktur ini.");
  }
  const supplierId: number = inv.supplier_id;

  const result = await transaction(async (conn) => {
    // 1. Update invoice status to posted
    await conn.execute("UPDATE invoices SET status = 'posted' WHERE id = ?", [invoiceId]);

    // 2. Insert AP record in payables
    const [apRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO payables
         (company_id, supplier_id, invoice_id, invoice_date, due_date,
          original_amount, paid_amount, balance_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 0.00, ?, 'open')`,
      [
        inv.company_id,
        supplierId,
        invoiceId,
        inv.invoice_date,
        inv.due_date ?? null,
        totalAmount.toFixed(2),
        totalAmount.toFixed(2), // initial balance = original_amount
      ]
    );

    return { payable_id: apRes.insertId };
  });

  await logAudit({
    user_id: userId,
    company_id: inv.company_id,
    action: "POST",
    module: "purchasing",
    entity: "invoices",
    entity_id: invoiceId,
    new_values: { status: "posted", payable_id: result.payable_id },
  });

  return result;
}

/**
 * Cancel Supplier Invoice: draft → cancelled
 */
export async function cancelSupplierInvoice(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const inv = await assertInvoiceAccess(session, invoiceId);
  if (inv.status !== "draft") {
    throw new Error("Hanya faktur berstatus 'draft' yang dapat dibatalkan.");
  }

  await execute("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [invoiceId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: inv.company_id,
    action: "CANCEL",
    module: "purchasing",
    entity: "invoices",
    entity_id: invoiceId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List Supplier Invoices with pagination and filters.
 */
export async function listSupplierInvoices(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: InvoiceStatus | "all";
    supplierId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Invoice>> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, supplierId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["inv.company_id = ?", "inv.invoice_type = 'purchase'"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("inv.status = ?"); qp.push(status); }
  if (supplierId) { conditions.push("inv.supplier_id = ?"); qp.push(supplierId); }
  if (search) {
    conditions.push("(inv.invoice_no LIKE ? OR s.name LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM invoices inv
     JOIN suppliers s ON inv.supplier_id = s.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Invoice[]>(
    `SELECT inv.*, s.name AS supplier_name
     FROM invoices inv
     JOIN suppliers s ON inv.supplier_id = s.id
     WHERE ${where}
     ORDER BY inv.invoice_date DESC, inv.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * List Accounts Payable (AP) records with pagination and filters.
 */
export async function listPayables(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: PayableStatus | "all";
    supplierId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Payable>> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, supplierId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("p.status = ?"); qp.push(status); }
  if (supplierId) { conditions.push("p.supplier_id = ?"); qp.push(supplierId); }
  if (search) {
    conditions.push("(s.name LIKE ? OR s.code LIKE ? OR inv.invoice_no LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM payables p
     JOIN suppliers s ON p.supplier_id = s.id
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Payable[]>(
    `SELECT p.*, s.name AS supplier_name, s.code AS supplier_code, inv.invoice_no
     FROM payables p
     JOIN suppliers s ON p.supplier_id = s.id
     LEFT JOIN invoices inv ON p.invoice_id = inv.id
     WHERE ${where}
     ORDER BY p.due_date ASC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Supplier Invoice by ID along with its line items.
 */
export async function getSupplierInvoiceById(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const invoice = await assertInvoiceAccess(session, invoiceId);

  const items = await query<InvoiceItem[]>(
    `SELECT ii.*, p.name AS product_name, p.sku AS product_sku
     FROM invoice_items ii
     LEFT JOIN products p ON ii.product_id = p.id
     WHERE ii.invoice_id = ?`,
    [invoiceId]
  );

  return { invoice, items };
}
