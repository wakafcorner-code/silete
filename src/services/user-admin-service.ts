/**
 * ERP Manajemen — User & Role Administration Service (Phase 16)
 *
 * User management, company assignments, role assignments, and permission inspection.
 */

import { execute, query, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requireRole } from "@/services/rbac-service";
import { logAudit } from "@/services/audit-service";
import { User, Role } from "@/types";
import { PaginatedResult, PaginationParams } from "@/types/pagination";
import bcrypt from "bcryptjs";

export interface CreateUserInput {
  username: string;
  email: string;
  name: string;
  password?: string;
  company_id?: number | null;
  role_id: number;
}

export async function listAdminUsers(
  session: UserSessionPayload | null,
  params: PaginationParams = {}
): Promise<PaginatedResult<User & { role_name?: string; company_name?: string }>> {
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "OWNER"]);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["1=1"];
  const qp: (string | number)[] = [];

  if (params.search) {
    conditions.push("(u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
    const term = `%${params.search}%`;
    qp.push(term, term, term);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
    qp
  );
  const total = Number(countRow?.total || 0);
  const totalPages = Math.ceil(total / limit);

  const data = await query<Array<User & { role_name?: string; company_name?: string }>>(
    `SELECT u.id, u.username, u.email, u.name, u.status, u.created_at,
            c.id AS company_id, c.name AS company_name,
            r.id AS role_id, r.name AS role_name
     FROM users u
     LEFT JOIN companies c ON u.id = c.id
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     ${whereClause}
     ORDER BY u.id ASC
     LIMIT ? OFFSET ?`,
    [...qp, limit, offset]
  );

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

export async function createAdminUser(
  session: UserSessionPayload | null,
  input: CreateUserInput
): Promise<number> {
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "OWNER"]);
  const adminId: number | null = session?.user_id ? Number(session.user_id) : null;

  // Check unique username / email
  const existing = await queryOne<User>(
    "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
    [input.username, input.email]
  );
  if (existing) {
    throw new Error("Username or email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password || "Password123!", 10);

  const res = await execute(
    `INSERT INTO users (username, email, password_hash, name, status, created_at)
     VALUES (?, ?, ?, ?, 'active', NOW())`,
    [input.username, input.email, passwordHash, input.name]
  );
  const newUserId = res.insertId;

  // Assign role
  await execute(
    "INSERT INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)",
    [newUserId, input.role_id, input.company_id || null]
  );

  await logAudit({
    user_id: adminId,
    company_id: input.company_id || null,
    action: "CREATE_USER",
    module: "users",
    entity: "users",
    entity_id: newUserId,
    new_values: {
      username: input.username,
      email: input.email,
      name: input.name,
      role_id: input.role_id,
    },
  });

  return newUserId;
}

export async function updateUserStatus(
  session: UserSessionPayload | null,
  userId: number,
  status: 'active' | 'inactive' | 'suspended'
): Promise<void> {
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "OWNER"]);
  const adminId: number | null = session?.user_id ? Number(session.user_id) : null;

  const current = await queryOne<User>("SELECT id, status FROM users WHERE id = ?", [userId]);
  if (!current) throw new Error("User not found");

  await execute("UPDATE users SET status = ? WHERE id = ?", [status, userId]);

  await logAudit({
    user_id: adminId,
    action: "UPDATE_USER_STATUS",
    module: "users",
    entity: "users",
    entity_id: userId,
    old_values: { status: current.status },
    new_values: { status },
  });
}

export async function listAllRoles(session: UserSessionPayload | null): Promise<Role[]> {
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "OWNER", "AUDITOR"]);
  return query<Role[]>("SELECT id, name, description FROM roles ORDER BY id ASC");
}
