import bcrypt from "bcryptjs";
import { query, queryOne, execute } from "@/lib/db";
import { User, UserStatus } from "@/types";
import { RowDataPacket } from "mysql2/promise";

export interface UserWithPassword extends User {
  password_hash: string;
}

export interface UserRoleRecord extends RowDataPacket {
  role_id: number;
  role_name: string;
  company_id: number | null;
}

/**
 * Find user by username or email including password_hash for authentication
 */
export async function findUserByCredentials(
  identifier: string
): Promise<UserWithPassword | null> {
  const sql = `
    SELECT id, username, email, password_hash, name, status, last_login_at, created_at, updated_at
    FROM users
    WHERE (username = ? OR email = ?)
    LIMIT 1
  `;
  return await queryOne<UserWithPassword>(sql, [identifier, identifier]);
}

/**
 * Find sanitized user by ID (excludes password_hash)
 */
export async function findUserById(id: number): Promise<User | null> {
  const sql = `
    SELECT id, username, email, name, status, last_login_at, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `;
  return await queryOne<User>(sql, [id]);
}

/**
 * Fetch all assigned roles and scoped company IDs for a user
 */
export async function getUserRoles(userId: number): Promise<{
  roles: string[];
  companyIds: number[];
}> {
  const sql = `
    SELECT ur.role_id, r.name as role_name, ur.company_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ?
  `;
  const rows = await query<UserRoleRecord[]>(sql, [userId]);

  const rolesSet = new Set<string>();
  const companiesSet = new Set<number>();

  for (const row of rows) {
    if (row.role_name) {
      rolesSet.add(row.role_name);
    }
    if (row.company_id !== null && row.company_id !== undefined) {
      companiesSet.add(Number(row.company_id));
    }
  }

  // If user is SUPER_ADMIN, include all active companies
  if (rolesSet.has("SUPER_ADMIN")) {
    const allCompanies = await query<RowDataPacket[]>(
      "SELECT id FROM companies WHERE status = 'active'"
    );
    for (const c of allCompanies) {
      companiesSet.add(Number((c as { id: number }).id));
    }
  }

  return {
    roles: Array.from(rolesSet),
    companyIds: Array.from(companiesSet),
  };
}

/**
 * Verify plaintext password against stored bcrypt hash
 */
export async function verifyPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  if (!plain || !hashed) return false;
  return await bcrypt.compare(plain, hashed);
}

/**
 * Hash a plain password using bcrypt with 12 salt rounds
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(plain, salt);
}

/**
 * Update user last login timestamp
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [userId]);
}

/**
 * Update user status (active, inactive, locked)
 */
export async function updateUserStatus(userId: number, status: UserStatus): Promise<void> {
  await execute("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
}
