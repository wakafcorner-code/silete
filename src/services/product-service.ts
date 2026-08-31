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

export interface Product extends RowDataPacket {
  id: number;
  company_id: number;
  category_id: number | null;
  sku: string;
  name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  minimum_stock: number;
  track_inventory: number;
  status: Status;
  category_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const ProductInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().optional().nullable(),
  sku: z
    .string()
    .min(2, "SKU produk minimal 2 karakter.")
    .max(80, "SKU produk maksimal 80 karakter.")
    .regex(/^[A-Za-z0-9\-_./]+$/, "SKU hanya boleh alfanumerik, dash, slash, atau titik."),
  name: z.string().min(2, "Nama produk minimal 2 karakter.").max(200, "Nama maksimal 200 karakter."),
  unit: z.string().min(1).max(30).default("KG"),
  cost_price: z.number().nonnegative("Harga pokok tidak boleh negatif.").default(200000),
  selling_price: z.number().nonnegative("Harga jual tidak boleh negatif.").default(230000),
  minimum_stock: z.number().nonnegative("Stok minimum tidak boleh negatif.").default(0),
  track_inventory: z.boolean().default(true),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type ProductInput = z.input<typeof ProductInputSchema>;

/**
 * List products with search, filter (category, status), and pagination
 */
export async function listProducts(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Product>> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.company_id = ?"];
  const queryParams: (string | number)[] = [companyId];

  if (params.status && params.status !== "all") {
    conditions.push("p.status = ?");
    queryParams.push(params.status);
  }

  if (params.categoryId) {
    conditions.push("p.category_id = ?");
    queryParams.push(Number(params.categoryId));
  }

  if (params.search) {
    conditions.push("(p.sku LIKE ? OR p.name LIKE ?)");
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Total count
  const countSql = `SELECT COUNT(*) as total FROM products p ${whereClause}`;
  const countRows = await query<RowDataPacket[]>(countSql, queryParams);
  const total = countRows[0] ? Number((countRows[0] as { total: number }).total) : 0;
  const totalPages = Math.ceil(total / limit);

  // Paginated Data with Category Join
  const dataSql = `
    SELECT p.id, p.company_id, p.category_id, p.sku, p.name, p.unit, 
           p.cost_price, p.selling_price, p.minimum_stock, p.track_inventory, 
           p.status, p.created_at, p.updated_at, pc.name as category_name
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    ${whereClause}
    ORDER BY p.id DESC
    LIMIT ? OFFSET ?
  `;
  const data = await query<Product[]>(dataSql, [...queryParams, limit, offset]);

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
 * Get product by ID with strict company isolation
 */
export async function getProductById(
  session: UserSessionPayload | null,
  productId: number
): Promise<Product | null> {
  requireAuth(session);

  const product = await queryOne<Product>(
    `SELECT p.id, p.company_id, p.category_id, p.sku, p.name, p.unit, 
            p.cost_price, p.selling_price, p.minimum_stock, p.track_inventory, 
            p.status, p.created_at, p.updated_at, pc.name as category_name
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.id = ? LIMIT 1`,
    [productId]
  );

  if (!product) return null;

  assertEntityCompanyAccess(session, product.company_id);
  return product;
}

/**
 * Create a new product with duplicate SKU prevention & audit log
 */
export async function createProduct(
  session: UserSessionPayload | null,
  input: ProductInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; sku: string; name: string }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = ProductInputSchema.parse(input);

  // Check unique SKU within same company
  const existing = await queryOne<Product>(
    "SELECT id FROM products WHERE company_id = ? AND sku = ? LIMIT 1",
    [companyId, validated.sku]
  );
  if (existing) {
    throw new Error(`SKU produk '${validated.sku}' sudah terdaftar untuk perusahaan ini.`);
  }

  // If category_id provided, verify category belongs to same company
  if (validated.category_id) {
    const category = await queryOne<RowDataPacket>(
      "SELECT id FROM product_categories WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.category_id, companyId]
    );
    if (!category) {
      throw new Error("Kategori yang dipilih tidak valid atau bukan milik perusahaan ini.");
    }
  }

  const res = await execute(
    `INSERT INTO products (company_id, category_id, sku, name, unit, cost_price, selling_price, minimum_stock, track_inventory, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.category_id || null,
      validated.sku,
      validated.name,
      validated.unit,
      validated.cost_price,
      validated.selling_price,
      validated.minimum_stock,
      validated.track_inventory ? 1 : 0,
      validated.status,
    ]
  );

  const productId = res.insertId;

  // Audit log
  await createAuditLog({
    companyId,
    userId: session?.userId || null,
    action: "CREATE",
    tableName: "products",
    recordId: productId,
    newValues: { ...validated, id: productId, company_id: companyId },
  });

  return {
    id: productId,
    company_id: companyId,
    sku: validated.sku,
    name: validated.name,
  };
}

/**
 * Update a product with duplicate SKU prevention & audit log
 */
export async function updateProduct(
  session: UserSessionPayload | null,
  productId: number,
  input: Partial<ProductInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const current = await getProductById(session, productId);
  if (!current) {
    throw new Error("Produk tidak ditemukan.");
  }

  const updatedData = {
    ...current,
    track_inventory: Boolean(current.track_inventory),
    ...input,
  };
  const validated = ProductInputSchema.parse(updatedData);

  // Check SKU uniqueness if changed
  if (validated.sku !== current.sku) {
    const existing = await queryOne<Product>(
      "SELECT id FROM products WHERE company_id = ? AND sku = ? AND id != ? LIMIT 1",
      [current.company_id, validated.sku, productId]
    );
    if (existing) {
      throw new Error(`SKU produk '${validated.sku}' sudah digunakan oleh produk lain.`);
    }
  }

  // Verify category ownership
  if (validated.category_id && validated.category_id !== current.category_id) {
    const category = await queryOne<RowDataPacket>(
      "SELECT id FROM product_categories WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.category_id, current.company_id]
    );
    if (!category) {
      throw new Error("Kategori yang dipilih tidak valid untuk perusahaan ini.");
    }
  }

  await execute(
    `UPDATE products SET 
       category_id = ?, sku = ?, name = ?, unit = ?, cost_price = ?, 
       selling_price = ?, minimum_stock = ?, track_inventory = ?, status = ?, updated_at = NOW()
     WHERE id = ? AND company_id = ?`,
    [
      validated.category_id || null,
      validated.sku,
      validated.name,
      validated.unit,
      validated.cost_price,
      validated.selling_price,
      validated.minimum_stock,
      validated.track_inventory ? 1 : 0,
      validated.status,
      productId,
      current.company_id,
    ]
  );

  // Audit log
  await createAuditLog({
    companyId: current.company_id,
    userId: session?.userId || null,
    action: "UPDATE",
    tableName: "products",
    recordId: productId,
    oldValues: { ...current },
    newValues: { ...validated },
  });
}
