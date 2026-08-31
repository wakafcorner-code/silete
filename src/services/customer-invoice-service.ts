/**
 * ERP Manajemen — Customer Invoice & Accounts Receivable (AR) Service
 *
 * Workflow:
 *   draft → posted (creates AR record atomically) → paid / cancelled
 *
 * CRITICAL:
 *   Posting a sales invoice atomically inserts an Accounts Receivable (AR)
 *   record into `receivables` with outstanding balance = total_amount.
 */

import { z } from "zod";
import { transaction, query, queryOne, execute } from "@/lib/db";
import { Invoice, InvoiceItem, Receivable, InvoiceStatus, ReceivableStatus } from "@/types";
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

const CustomerInvoiceItemInputSchema = z.object({
  product_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0"),
  unit_price: z.number().min(0, "Harga satuan tidak boleh negatif"),
  tax_amount: z.number().min(0).default(0),
});

export const CustomerInvoiceSchema = z.object({
  customer_id: z.number().int().positive("Pelanggan wajib dipilih"),
  sales_order_id: z.number().int().positive().optional().nullable(),
  invoice_no: z.string().min(3).max(50),
  invoice_date: z.string().min(1), // "YYYY-MM-DD"
  due_date: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(CustomerInvoiceItemInputSchema).min(1, "Minimal harus ada 1 baris item faktur"),
});

export type CustomerInvoiceInput = z.infer<typeof CustomerInvoiceSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertInvoiceAccess(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<Invoice> {
  const inv = await queryOne<Invoice>(
    `SELECT inv.*, c.name AS customer_name
     FROM invoices inv
     LEFT JOIN customers c ON inv.customer_id = c.id
     WHERE inv.id = ? AND inv.invoice_type = 'sales'`,
    [invoiceId]
  );
  if (!inv) throw new Error("Faktur Penjualan tidak ditemukan.");
  assertEntityCompanyAccess(session, inv.company_id);
  return inv;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Customer Invoice in DRAFT status.
 * Calculates financial totals server-side and writes header + items atomically.
 */
export async function createCustomerInvoice(
  session: UserSessionPayload | null,
  input: CustomerInvoiceInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; invoice_no: string; total_amount: number }> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = CustomerInvoiceSchema.parse(input);
  const userId = sessionUserId(session);

  // Prevent duplicate invoice_no in company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM invoices WHERE company_id = ? AND invoice_no = ? AND invoice_type = 'sales' LIMIT 1",
    [companyId, validated.invoice_no]
  );
  if (existing) {
    throw new Error(`Nomor Faktur '${validated.invoice_no}' sudah digunakan.`);
  }

  // Verify customer belongs to company
  const customer = await queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM customers WHERE id = ? AND company_id = ? LIMIT 1",
    [validated.customer_id, companyId]
  );
  if (!customer) throw new Error("Pelanggan tidak ditemukan atau tidak aktif.");

  // If sales_order_id provided, verify it belongs to company
  if (validated.sales_order_id) {
    const so = await queryOne<{ id: number }>(
      "SELECT id FROM sales_orders WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.sales_order_id, companyId]
    );
    if (!so) throw new Error("Sales Order tidak valid untuk perusahaan ini.");
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
         (company_id, customer_id, sales_order_id, invoice_no, invoice_type,
          invoice_date, due_date, status, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, 'sales', ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        companyId,
        validated.customer_id,
        validated.sales_order_id ?? null,
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
    module: "sales",
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
 * Post Customer Invoice: status → posted AND creates Accounts Receivable (AR) record atomically.
 */
export async function postCustomerInvoice(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<{ receivable_id: number }> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const inv = await assertInvoiceAccess(session, invoiceId);
  const userId = sessionUserId(session);

  if (inv.status !== "draft") {
    throw new Error(`Faktur dengan status '${inv.status}' tidak dapat diposting.`);
  }

  const totalAmount = Number(inv.total_amount);
  if (totalAmount <= 0) {
    throw new Error("Total faktur harus lebih dari 0.");
  }
  if (!inv.customer_id) {
    throw new Error("Customer ID tidak valid pada faktur ini.");
  }
  const customerId: number = inv.customer_id;

  const result = await transaction(async (conn) => {
    // 1. Update invoice status to posted
    await conn.execute("UPDATE invoices SET status = 'posted' WHERE id = ?", [invoiceId]);

    // 2. Insert AR record in receivables
    const [arRes] = await conn.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO receivables
         (company_id, customer_id, invoice_id, invoice_date, due_date,
          original_amount, paid_amount, balance_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 0.00, ?, 'open')`,
      [
        inv.company_id,
        customerId,
        invoiceId,
        inv.invoice_date,
        inv.due_date ?? null,
        totalAmount.toFixed(2),
        totalAmount.toFixed(2), // initial balance = original_amount
      ]
    );

    // 3. Update linked Sales Order status to invoiced
    if (inv.sales_order_id) {
      await conn.execute("UPDATE sales_orders SET status = 'invoiced' WHERE id = ?", [
        inv.sales_order_id,
      ]);
    }

    return { receivable_id: arRes.insertId };
  });

  await logAudit({
    user_id: userId,
    company_id: inv.company_id,
    action: "POST",
    module: "sales",
    entity: "invoices",
    entity_id: invoiceId,
    new_values: { status: "posted", receivable_id: result.receivable_id },
  });

  return result;
}

/**
 * Cancel Customer Invoice: draft → cancelled
 */
export async function cancelCustomerInvoice(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const inv = await assertInvoiceAccess(session, invoiceId);
  if (inv.status !== "draft") {
    throw new Error("Hanya faktur berstatus 'draft' yang dapat dibatalkan.");
  }

  await execute("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [invoiceId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: inv.company_id,
    action: "CANCEL",
    module: "sales",
    entity: "invoices",
    entity_id: invoiceId,
    new_values: { status: "cancelled" },
  });
}

/**
 * List Customer Invoices with pagination and filters.
 */
export async function listCustomerInvoices(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: InvoiceStatus | "all";
    customerId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Invoice>> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, customerId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["inv.company_id = ?", "inv.invoice_type = 'sales'"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("inv.status = ?"); qp.push(status); }
  if (customerId) { conditions.push("inv.customer_id = ?"); qp.push(customerId); }
  if (search) {
    conditions.push("(inv.invoice_no LIKE ? OR c.name LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM invoices inv
     JOIN customers c ON inv.customer_id = c.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Invoice[]>(
    `SELECT inv.*, c.name AS customer_name
     FROM invoices inv
     JOIN customers c ON inv.customer_id = c.id
     WHERE ${where}
     ORDER BY inv.invoice_date DESC, inv.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * List Accounts Receivable (AR) records with pagination and filters.
 */
export async function listReceivables(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: ReceivableStatus | "all";
    customerId?: number;
    search?: string;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Receivable>> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, customerId, search } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["r.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("r.status = ?"); qp.push(status); }
  if (customerId) { conditions.push("r.customer_id = ?"); qp.push(customerId); }
  if (search) {
    conditions.push("(c.name LIKE ? OR c.code LIKE ? OR inv.invoice_no LIKE ?)");
    qp.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM receivables r
     JOIN customers c ON r.customer_id = c.id
     LEFT JOIN invoices inv ON r.invoice_id = inv.id
     WHERE ${where}`,
    qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<Receivable[]>(
    `SELECT r.*, c.name AS customer_name, c.code AS customer_code, inv.invoice_no
     FROM receivables r
     JOIN customers c ON r.customer_id = c.id
     LEFT JOIN invoices inv ON r.invoice_id = inv.id
     WHERE ${where}
     ORDER BY r.due_date ASC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Customer Invoice by ID along with its line items.
 */
export async function getCustomerInvoiceById(
  session: UserSessionPayload | null,
  invoiceId: number
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  requirePermission(session, PERMISSIONS.SALES_VIEW);
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
