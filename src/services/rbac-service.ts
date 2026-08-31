import { PermissionKey, ROLE_PERMISSIONS } from "@/config/permissions";
import { UserSessionPayload } from "@/services/session-service";

/**
 * Compute the union of permissions from all assigned user roles
 */
export function getEffectivePermissions(roles: string[]): PermissionKey[] {
  const permissionsSet = new Set<PermissionKey>();

  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    for (const perm of rolePerms) {
      permissionsSet.add(perm);
    }
  }

  return Array.from(permissionsSet);
}

/**
 * Check if the user has a specific role
 */
export function hasRole(session: UserSessionPayload | null, requiredRole: string | string[]): boolean {
  if (!session) return false;
  if (session.roles.includes("SUPER_ADMIN")) return true;

  const rolesToCheck = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  return rolesToCheck.some((r) => session.roles.includes(r));
}

/**
 * Check if the user has a specific permission
 */
export function hasPermission(
  session: UserSessionPayload | null,
  requiredPermission: PermissionKey | PermissionKey[]
): boolean {
  if (!session) return false;
  if (session.roles.includes("SUPER_ADMIN")) return true;

  const permsToCheck = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  return permsToCheck.some((p) => session.permissions.includes(p));
}

/**
 * Check if the user has access to a specific company
 */
export function hasCompanyAccess(session: UserSessionPayload | null, companyId: number): boolean {
  if (!session) return false;
  if (session.roles.includes("SUPER_ADMIN")) return true;
  return session.companyIds.includes(Number(companyId));
}

/**
 * Server-Side Authorization Guard - Require Authenticated Session
 */
export function requireAuth(session: UserSessionPayload | null): UserSessionPayload {
  if (!session) {
    const error = new Error("Unauthenticated: Anda harus masuk untuk mengakses sumber daya ini.");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return session;
}

/**
 * Server-Side Authorization Guard - Require Specific Role(s)
 */
export function requireRole(
  session: UserSessionPayload | null,
  role: string | string[]
): UserSessionPayload {
  const verifiedSession = requireAuth(session);
  if (!hasRole(verifiedSession, role)) {
    const error = new Error("Forbidden: Anda tidak memiliki peran yang diizinkan untuk tindakan ini.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
  return verifiedSession;
}

/**
 * Server-Side Authorization Guard - Require Specific Permission(s)
 */
export function requirePermission(
  session: UserSessionPayload | null,
  permission: PermissionKey | PermissionKey[]
): UserSessionPayload {
  const verifiedSession = requireAuth(session);
  if (!hasPermission(verifiedSession, permission)) {
    const error = new Error("Forbidden: Anda tidak memiliki hak akses (permission) untuk tindakan ini.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
  return verifiedSession;
}

/**
 * Server-Side Authorization Guard - Require Company Access
 */
export function requireCompanyAccess(
  session: UserSessionPayload | null,
  companyId: number
): UserSessionPayload {
  const verifiedSession = requireAuth(session);
  if (!hasCompanyAccess(verifiedSession, companyId)) {
    const error = new Error("Forbidden: Anda tidak memiliki akses ke data perusahaan ini.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
  return verifiedSession;
}
