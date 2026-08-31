import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { Warehouse } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";

export const WarehouseInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(255),
  address: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type WarehouseInput = z.infer<typeof WarehouseInputSchema>;

/**
 * List warehouses strictly scoped to the authorized company
 */
export async function listWarehouses(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<Warehouse[]> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const warehouses = await query<Warehouse[]>(
    `SELECT id, company_id, branch_id, code, name, address, status, created_at, updated_at
     FROM warehouses
     WHERE company_id = ?
     ORDER BY id ASC`,
    [companyId]
  );

  return warehouses;
}

/**
 * Get warehouse by ID with company isolation verification
 */
export async function getWarehouseById(
  session: UserSessionPayload | null,
  warehouseId: number
): Promise<Warehouse | null> {
  requireAuth(session);

  const warehouse = await queryOne<Warehouse>(
    "SELECT id, company_id, branch_id, code, name, address, status, created_at, updated_at FROM warehouses WHERE id = ? LIMIT 1",
    [warehouseId]
  );

  if (!warehouse) {
    return null;
  }

  // Enforce company isolation
  assertEntityCompanyAccess(session, warehouse.company_id);

  return warehouse;
}

/**
 * Create a new warehouse in the authorized company
 */
export async function createWarehouse(
  session: UserSessionPayload | null,
  input: WarehouseInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; code: string; name: string }> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = WarehouseInputSchema.parse(input);

  const res = await execute(
    `INSERT INTO warehouses (company_id, branch_id, code, name, address, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.branch_id || null,
      validated.code,
      validated.name,
      validated.address || null,
      validated.status,
    ]
  );

  return {
    id: res.insertId,
    company_id: companyId,
    code: validated.code,
    name: validated.name,
  };
}

/**
 * Update a warehouse
 */
export async function updateWarehouse(
  session: UserSessionPayload | null,
  warehouseId: number,
  input: Partial<WarehouseInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.INVENTORY_MANAGE);
  const current = await getWarehouseById(session, warehouseId);
  if (!current) {
    throw new Error("Gudang tidak ditemukan.");
  }

  const updated = {
    ...current,
    ...input,
  };
  const validated = WarehouseInputSchema.parse(updated);

  await execute(
    `UPDATE warehouses SET branch_id = ?, name = ?, address = ?, status = ?, updated_at = NOW() WHERE id = ? AND company_id = ?`,
    [validated.branch_id || null, validated.name, validated.address || null, validated.status, warehouseId, current.company_id]
  );
}
