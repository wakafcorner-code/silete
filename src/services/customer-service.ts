import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { createAuditLog } from "@/services/audit-service";
import { PERMISSIONS } from "@/config/permissions";
import { PaginationParams, PaginatedResult } from "@/types/pagination";
import { RowDataPacket } from "mysql2/promise";
import { Status } from "@/types";

export interface Customer extends RowDataPacket {
  id: number;
  company_id: number;
  code: string;
  name: string;
  tax_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: number;
  payment_terms_days: number;
  status: Status;
  created_at: string;
  updated_at: string;
}

export const CustomerInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  code: z
    .string()
    .min(2, "Kode pelanggan minimal 2 karakter.")
    .max(40, "Kode pelanggan maksimal 40 karakter.")
    .regex(/^[A-Za-z0-9\-_.]+$/, "Kode hanya boleh alfanumerik, dash, underscore, atau titik."),
  name: z.string().min(2, "Nama pelanggan minimal 2 karakter.").max(150, "Nama maksimal 150 karakter."),
  tax_number: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Format email tidak valid.").max(150).optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  credit_limit: z.number().nonnegative().default(0),
  payment_terms_days: z.number().int().nonnegative().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type CustomerInput = z.input<typeof CustomerInputSchema>;

/**
 * List customers with search, filter, and pagination strictly scoped to authorized company
 */
export async function listCustomers(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Customer>> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["company_id = ?"];
  const queryParams: (string | number)[] = [companyId];

  if (params.status && params.status !== "all") {
    conditions.push("status = ?");
    queryParams.push(params.status);
  }

  if (params.search) {
    conditions.push("(code LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ?)");
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Total count
  const countSql = `SELECT COUNT(*) as total FROM customers ${whereClause}`;
  const countRows = await query<RowDataPacket[]>(countSql, queryParams);
  const total = countRows[0] ? Number((countRows[0] as { total: number }).total) : 0;
  const totalPages = Math.ceil(total / limit);

  // Paginated Data
  const dataSql = `
    SELECT id, company_id, code, name, tax_number, phone, email, address, 
           credit_limit, payment_terms_days, status, created_at, updated_at
    FROM customers
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const data = await query<Customer[]>(dataSql, [...queryParams, limit, offset]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get customer by ID with strict company isolation
 */
export async function getCustomerById(
  session: UserSessionPayload | null,
  customerId: number
): Promise<Customer | null> {
  requireAuth(session);

  const customer = await queryOne<Customer>(
    `SELECT id, company_id, code, name, tax_number, phone, email, address, 
            credit_limit, payment_terms_days, status, created_at, updated_at
     FROM customers
     WHERE id = ? LIMIT 1`,
    [customerId]
  );

  if (!customer) return null;

  assertEntityCompanyAccess(session, customer.company_id);
  return customer;
}

/**
 * Create a new customer with duplicate code prevention & audit log
 */
export async function createCustomer(
  session: UserSessionPayload | null,
  input: CustomerInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; code: string; name: string }> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = CustomerInputSchema.parse(input);

  // Duplicate code prevention within same company
  const existing = await queryOne<Customer>(
    "SELECT id FROM customers WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, validated.code]
  );
  if (existing) {
    throw new Error(`Kode pelanggan '${validated.code}' sudah terdaftar untuk perusahaan ini.`);
  }

  const res = await execute(
    `INSERT INTO customers (company_id, code, name, tax_number, phone, email, address, credit_limit, payment_terms_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.code,
      validated.name,
      validated.tax_number || null,
      validated.phone || null,
      validated.email || null,
      validated.address || null,
      validated.credit_limit,
      validated.payment_terms_days,
      validated.status,
    ]
  );

  const customerId = res.insertId;

  // Audit log
  await createAuditLog({
    companyId,
    userId: session?.userId || null,
    action: "CREATE",
    tableName: "customers",
    recordId: customerId,
    newValues: { ...validated, id: customerId, company_id: companyId },
  });

  return {
    id: customerId,
    company_id: companyId,
    code: validated.code,
    name: validated.name,
  };
}

/**
 * Update a customer with duplicate code prevention & audit log
 */
export async function updateCustomer(
  session: UserSessionPayload | null,
  customerId: number,
  input: Partial<CustomerInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.SALES_MANAGE);
  const current = await getCustomerById(session, customerId);
  if (!current) {
    throw new Error("Pelanggan tidak ditemukan.");
  }

  const updatedData = {
    ...current,
    ...input,
  };
  const validated = CustomerInputSchema.parse(updatedData);

  // Check code uniqueness if changed
  if (validated.code !== current.code) {
    const existing = await queryOne<Customer>(
      "SELECT id FROM customers WHERE company_id = ? AND code = ? AND id != ? LIMIT 1",
      [current.company_id, validated.code, customerId]
    );
    if (existing) {
      throw new Error(`Kode pelanggan '${validated.code}' sudah digunakan oleh pelanggan lain.`);
    }
  }

  await execute(
    `UPDATE customers SET 
       code = ?, name = ?, tax_number = ?, phone = ?, email = ?, 
       address = ?, credit_limit = ?, payment_terms_days = ?, status = ?, updated_at = NOW()
     WHERE id = ? AND company_id = ?`,
    [
      validated.code,
      validated.name,
      validated.tax_number || null,
      validated.phone || null,
      validated.email || null,
      validated.address || null,
      validated.credit_limit,
      validated.payment_terms_days,
      validated.status,
      customerId,
      current.company_id,
    ]
  );

  // Audit log
  await createAuditLog({
    companyId: current.company_id,
    userId: session?.userId || null,
    action: "UPDATE",
    tableName: "customers",
    recordId: customerId,
    oldValues: { ...current },
    newValues: { ...validated },
  });
}
