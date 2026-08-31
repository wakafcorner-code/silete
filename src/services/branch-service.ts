import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { Branch } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";

export const BranchInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(255),
  address: z.string().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type BranchInput = z.infer<typeof BranchInputSchema>;

/**
 * List branches strictly scoped to the authorized company
 */
export async function listBranches(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<Branch[]> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const branches = await query<Branch[]>(
    `SELECT id, company_id, code, name, address, phone, status, created_at, updated_at
     FROM branches
     WHERE company_id = ?
     ORDER BY id ASC`,
    [companyId]
  );

  return branches;
}

/**
 * Get branch by ID with company isolation verification
 */
export async function getBranchById(
  session: UserSessionPayload | null,
  branchId: number
): Promise<Branch | null> {
  requireAuth(session);

  const branch = await queryOne<Branch>(
    "SELECT id, company_id, code, name, address, phone, status, created_at, updated_at FROM branches WHERE id = ? LIMIT 1",
    [branchId]
  );

  if (!branch) {
    return null;
  }

  // Enforce company isolation
  assertEntityCompanyAccess(session, branch.company_id);

  return branch;
}

/**
 * Create a new branch in the authorized company
 */
export async function createBranch(
  session: UserSessionPayload | null,
  input: BranchInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; code: string; name: string }> {
  requirePermission(session, PERMISSIONS.COMPANY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = BranchInputSchema.parse(input);

  const res = await execute(
    `INSERT INTO branches (company_id, code, name, address, phone, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.code,
      validated.name,
      validated.address || null,
      validated.phone || null,
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
 * Update a branch
 */
export async function updateBranch(
  session: UserSessionPayload | null,
  branchId: number,
  input: Partial<BranchInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.COMPANY_MANAGE);
  const current = await getBranchById(session, branchId);
  if (!current) {
    throw new Error("Cabang tidak ditemukan.");
  }

  const updated = {
    ...current,
    ...input,
  };
  const validated = BranchInputSchema.parse(updated);

  await execute(
    `UPDATE branches SET name = ?, address = ?, phone = ?, status = ?, updated_at = NOW() WHERE id = ? AND company_id = ?`,
    [validated.name, validated.address || null, validated.phone || null, validated.status, branchId, current.company_id]
  );
}
