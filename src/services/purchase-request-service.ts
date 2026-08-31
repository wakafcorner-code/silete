/**
 * ERP Manajemen — Purchase Request (PR) Service
 *
 * Workflow:
 *   draft → submitted → approved / rejected → converted (to PO)
 */

import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { PurchaseRequest, PurchaseRequestStatus } from "@/types";
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

export const PurchaseRequestSchema = z.object({
  branch_id: z.number().int().positive().optional().nullable(),
  request_no: z.string().min(3).max(50),
  request_date: z.string().min(1), // "YYYY-MM-DD"
  notes: z.string().max(1000).optional().nullable(),
});

export type PurchaseRequestInput = z.infer<typeof PurchaseRequestSchema>;

function sessionUserId(session: UserSessionPayload | null): number | null {
  return session?.userId ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertPurchaseRequestAccess(
  session: UserSessionPayload | null,
  requestId: number
): Promise<PurchaseRequest> {
  const pr = await queryOne<PurchaseRequest>(
    `SELECT pr.*, b.name AS branch_name, u.name AS requested_by_name
     FROM purchase_requests pr
     LEFT JOIN branches b ON pr.branch_id = b.id
     LEFT JOIN users u ON pr.requested_by = u.id
     WHERE pr.id = ?`,
    [requestId]
  );
  if (!pr) throw new Error("Purchase Request tidak ditemukan.");
  assertEntityCompanyAccess(session, pr.company_id);
  return pr;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new Purchase Request in DRAFT status.
 */
export async function createPurchaseRequest(
  session: UserSessionPayload | null,
  input: PurchaseRequestInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; request_no: string }> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const validated = PurchaseRequestSchema.parse(input);
  const userId = sessionUserId(session);

  // Check duplicate request_no in the same company
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM purchase_requests WHERE company_id = ? AND request_no = ? LIMIT 1",
    [companyId, validated.request_no]
  );
  if (existing) {
    throw new Error(`Nomor Purchase Request '${validated.request_no}' sudah digunakan.`);
  }

  // If branch_id provided, verify it belongs to company
  if (validated.branch_id) {
    const branch = await queryOne<{ id: number }>(
      "SELECT id FROM branches WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.branch_id, companyId]
    );
    if (!branch) throw new Error("Cabang tidak valid untuk perusahaan ini.");
  }

  const res = await execute(
    `INSERT INTO purchase_requests (company_id, branch_id, request_no, request_date, requested_by, status, notes)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
    [
      companyId,
      validated.branch_id ?? null,
      validated.request_no,
      validated.request_date,
      userId,
      validated.notes ?? null,
    ]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "CREATE",
    module: "purchasing",
    entity: "purchase_requests",
    entity_id: res.insertId,
    new_values: { ...validated, company_id: companyId, status: "draft" },
  });

  return { id: res.insertId, request_no: validated.request_no };
}

/**
 * Submit PR for approval: draft → submitted
 */
export async function submitPurchaseRequest(
  session: UserSessionPayload | null,
  requestId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const pr = await assertPurchaseRequestAccess(session, requestId);
  if (pr.status !== "draft") {
    throw new Error(`Hanya draft PR yang dapat diajukan (status saat ini: ${pr.status}).`);
  }

  await execute("UPDATE purchase_requests SET status = 'submitted' WHERE id = ?", [requestId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: pr.company_id,
    action: "SUBMIT",
    module: "purchasing",
    entity: "purchase_requests",
    entity_id: requestId,
    new_values: { status: "submitted" },
  });
}

/**
 * Approve PR: submitted → approved (requires PURCHASING_MANAGE)
 */
export async function approvePurchaseRequest(
  session: UserSessionPayload | null,
  requestId: number
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const pr = await assertPurchaseRequestAccess(session, requestId);
  if (pr.status !== "submitted" && pr.status !== "draft") {
    throw new Error(`Status PR '${pr.status}' tidak valid untuk disetujui.`);
  }

  await execute("UPDATE purchase_requests SET status = 'approved' WHERE id = ?", [requestId]);
  await logAudit({
    user_id: sessionUserId(session),
    company_id: pr.company_id,
    action: "APPROVE",
    module: "purchasing",
    entity: "purchase_requests",
    entity_id: requestId,
    new_values: { status: "approved" },
  });
}

/**
 * Reject PR: submitted → rejected
 */
export async function rejectPurchaseRequest(
  session: UserSessionPayload | null,
  requestId: number,
  reason?: string
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const pr = await assertPurchaseRequestAccess(session, requestId);
  if (pr.status !== "submitted" && pr.status !== "draft") {
    throw new Error(`Status PR '${pr.status}' tidak valid untuk ditolak.`);
  }

  const updatedNotes = reason ? `${pr.notes ? pr.notes + " | " : ""}Ditolak: ${reason}` : pr.notes;
  await execute("UPDATE purchase_requests SET status = 'rejected', notes = ? WHERE id = ?", [
    updatedNotes,
    requestId,
  ]);

  await logAudit({
    user_id: sessionUserId(session),
    company_id: pr.company_id,
    action: "REJECT",
    module: "purchasing",
    entity: "purchase_requests",
    entity_id: requestId,
    new_values: { status: "rejected", notes: updatedNotes },
  });
}

/**
 * List Purchase Requests for authorized company.
 */
export async function listPurchaseRequests(
  session: UserSessionPayload | null,
  params: Omit<PaginationParams, "status"> & {
    status?: PurchaseRequestStatus | "all";
    search?: string;
    branchId?: number;
  },
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<PurchaseRequest>> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const { page = 1, limit = 20, status, search, branchId } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["pr.company_id = ?"];
  const qp: (string | number)[] = [companyId];

  if (status && status !== "all") { conditions.push("pr.status = ?"); qp.push(status); }
  if (branchId) { conditions.push("pr.branch_id = ?"); qp.push(branchId); }
  if (search) { conditions.push("pr.request_no LIKE ?"); qp.push(`%${search}%`); }

  const where = conditions.join(" AND ");
  const countRows = await query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM purchase_requests pr WHERE ${where}`, qp
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<PurchaseRequest[]>(
    `SELECT pr.*, b.name AS branch_name, u.name AS requested_by_name
     FROM purchase_requests pr
     LEFT JOIN branches b ON pr.branch_id = b.id
     LEFT JOIN users u ON pr.requested_by = u.id
     WHERE ${where}
     ORDER BY pr.request_date DESC, pr.id DESC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

  return { data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get Purchase Request by ID.
 */
export async function getPurchaseRequestById(
  session: UserSessionPayload | null,
  requestId: number
): Promise<PurchaseRequest | null> {
  requirePermission(session, PERMISSIONS.PURCHASING_VIEW);
  return assertPurchaseRequestAccess(session, requestId);
}
