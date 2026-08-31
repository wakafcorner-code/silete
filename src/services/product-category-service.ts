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

export interface ProductCategory extends RowDataPacket {
  id: number;
  company_id: number;
  code: string;
  name: string;
  status: Status;
}

export const ProductCategoryInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  code: z
    .string()
    .min(2, "Kode kategori minimal 2 karakter.")
    .max(40, "Kode kategori maksimal 40 karakter.")
    .regex(/^[A-Za-z0-9\-_.]+$/, "Kode hanya boleh alfanumerik, dash, underscore, atau titik.")
    .optional(),
  name: z.string().min(2, "Nama kategori minimal 2 karakter.").max(150, "Nama maksimal 150 karakter."),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type ProductCategoryInput = z.input<typeof ProductCategoryInputSchema>;

/**
 * List product categories with search, filter, and pagination
 */
export async function listProductCategories(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<ProductCategory>> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["company_id = ?"];
  const queryParams: (string | number)[] = [companyId];

  if (params.status && params.status !== "all") {
    conditions.push("status = ?");
    queryParams.push(params.status);
  }

  if (params.search) {
    conditions.push("(code LIKE ? OR name LIKE ?)");
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Total count
  const countSql = `SELECT COUNT(*) as total FROM product_categories ${whereClause}`;
  const countRows = await query<RowDataPacket[]>(countSql, queryParams);
  const total = countRows[0] ? Number((countRows[0] as { total: number }).total) : 0;
  const totalPages = Math.ceil(total / limit);

  // Paginated Data
  const dataSql = `
    SELECT id, company_id, code, name, status
    FROM product_categories
    ${whereClause}
    ORDER BY id ASC
    LIMIT ? OFFSET ?
  `;
  const data = await query<ProductCategory[]>(dataSql, [...queryParams, limit, offset]);

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
 * Get category by ID with strict company isolation
 */
export async function getProductCategoryById(
  session: UserSessionPayload | null,
  categoryId: number
): Promise<ProductCategory | null> {
  requireAuth(session);

  const category = await queryOne<ProductCategory>(
    "SELECT id, company_id, code, name, status FROM product_categories WHERE id = ? LIMIT 1",
    [categoryId]
  );

  if (!category) return null;

  assertEntityCompanyAccess(session, category.company_id);
  return category;
}

/**
 * Create a new product category
 */
export async function createProductCategory(
  session: UserSessionPayload | null,
  input: ProductCategoryInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; code: string; name: string }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = ProductCategoryInputSchema.parse(input);
  const code = validated.code || `CAT-${Date.now().toString().slice(-6)}`;

  // Check unique code per company
  const existing = await queryOne<ProductCategory>(
    "SELECT id FROM product_categories WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, code]
  );
  if (existing) {
    throw new Error(`Kode kategori '${code}' sudah terdaftar untuk perusahaan ini.`);
  }

  const res = await execute(
    "INSERT INTO product_categories (company_id, code, name, status) VALUES (?, ?, ?, ?)",
    [companyId, code, validated.name, validated.status]
  );

  const categoryId = res.insertId;

  // Audit log
  await createAuditLog({
    companyId,
    userId: session?.userId || null,
    action: "CREATE",
    tableName: "product_categories",
    recordId: categoryId,
    newValues: { ...validated, code, id: categoryId, company_id: companyId },
  });

  return {
    id: categoryId,
    company_id: companyId,
    code,
    name: validated.name,
  };
}

/**
 * Update a product category
 */
export async function updateProductCategory(
  session: UserSessionPayload | null,
  categoryId: number,
  input: Partial<ProductCategoryInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const current = await getProductCategoryById(session, categoryId);
  if (!current) {
    throw new Error("Kategori produk tidak ditemukan.");
  }

  const updatedData = {
    ...current,
    ...input,
  };
  const validated = ProductCategoryInputSchema.parse(updatedData);

  // Check code uniqueness
  if (validated.code !== current.code) {
    const existing = await queryOne<ProductCategory>(
      "SELECT id FROM product_categories WHERE company_id = ? AND code = ? AND id != ? LIMIT 1",
      [current.company_id, validated.code, categoryId]
    );
    if (existing) {
      throw new Error(`Kode kategori '${validated.code}' sudah digunakan.`);
    }
  }

  await execute(
    "UPDATE product_categories SET code = ?, name = ?, status = ? WHERE id = ? AND company_id = ?",
    [validated.code, validated.name, validated.status, categoryId, current.company_id]
  );

  // Audit log
  await createAuditLog({
    companyId: current.company_id,
    userId: session?.userId || null,
    action: "UPDATE",
    tableName: "product_categories",
    recordId: categoryId,
    oldValues: { ...current },
    newValues: { ...validated },
  });
}
