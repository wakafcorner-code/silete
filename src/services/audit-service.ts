import { execute, query } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { resolveCompanyScope } from "@/services/company-context-service";
import { requireAuth, requireRole } from "@/services/rbac-service";
import { PaginationParams, PaginatedResult } from "@/types/pagination";
import { RowDataPacket } from "mysql2/promise";

export interface AuditLogEntry {
  companyId: number | null;
  userId: number | null;
  action: string;
  tableName?: string | null;
  recordId?: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRecord extends RowDataPacket {
  id: number;
  company_id: number | null;
  user_id: number | null;
  action: string;
  table_name: string | null;
  record_id: number | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  username?: string | null;
  user_name?: string | null;
}

/**
 * Record an audit log entry for a mutation
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const oldValStr = entry.oldValues ? JSON.stringify(entry.oldValues) : null;
    const newValStr = entry.newValues ? JSON.stringify(entry.newValues) : null;

    await execute(
      `INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        entry.companyId || null,
        entry.userId || null,
        entry.action,
        entry.tableName || null,
        entry.recordId || null,
        oldValStr,
        newValStr,
        entry.ipAddress || null,
        entry.userAgent || null,
      ]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
    // Non-blocking for business flow, but logged
  }
}

/**
 * Query company-scoped audit logs (requires AUDITOR / SUPER_ADMIN / ADMIN)
 */
export async function listAuditLogs(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<AuditLogRecord>> {
  requireAuth(session);
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "AUDITOR"]);

  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["al.company_id = ?"];
  const queryParams: (string | number)[] = [companyId];

  if (params.search) {
    conditions.push("(al.action LIKE ? OR al.table_name LIKE ?)");
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total
  const countSql = `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`;
  const countRows = await query<RowDataPacket[]>(countSql, queryParams);
  const total = countRows[0] ? Number((countRows[0] as { total: number }).total) : 0;
  const totalPages = Math.ceil(total / limit);

  // Fetch paginated records
  const dataSql = `
    SELECT al.id, al.company_id, al.user_id, al.action, al.table_name, al.record_id, 
           al.old_values, al.new_values, al.ip_address, al.user_agent, al.created_at,
           u.username, u.name as user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${whereClause}
    ORDER BY al.id DESC
    LIMIT ? OFFSET ?
  `;

  const data = await query<AuditLogRecord[]>(dataSql, [...queryParams, limit, offset]);

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
 * Convenience wrapper matching the simpler call signature used in domain services.
 */
export async function logAudit(params: {
  user_id?: number | null;
  company_id?: number | null;
  action: string;
  module?: string;
  entity?: string;
  entity_id?: number | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  const tableName = params.module && params.entity
    ? `${params.module}.${params.entity}`
    : params.entity ?? params.module ?? null;

  await createAuditLog({
    companyId: params.company_id ?? null,
    userId: params.user_id ?? null,
    action: params.action,
    tableName,
    recordId: params.entity_id ?? null,
    oldValues: params.old_values ?? null,
    newValues: params.new_values ?? null,
  });
}

