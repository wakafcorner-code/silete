import { cookies } from "next/headers";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, hasCompanyAccess } from "@/services/rbac-service";

export const ACTIVE_COMPANY_COOKIE = "erp_active_company";

/**
 * Resolve and enforce the active company ID for a given user session
 * Throws 401 if unauthenticated, 403 if requestedCompanyId is unauthorized.
 */
export async function resolveCompanyScope(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<number> {
  const verifiedSession = requireAuth(session);

  // 1. If explicit companyId requested, verify authorization
  if (requestedCompanyId !== undefined && requestedCompanyId !== null) {
    const targetId = Number(requestedCompanyId);
    if (isNaN(targetId) || targetId <= 0) {
      const error = new Error("Invalid company_id provided.");
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    if (!hasCompanyAccess(verifiedSession, targetId)) {
      const error = new Error(
        `Forbidden: Anda tidak memiliki hak akses ke data perusahaan (Company ID: ${targetId}).`
      );
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }

    return targetId;
  }

  // 2. If user is restricted to a single company, always return that company
  if (verifiedSession.companyIds.length === 1 && !verifiedSession.roles.includes("SUPER_ADMIN")) {
    return verifiedSession.companyIds[0];
  }

  // 3. Check cookie preference for multi-company / SuperAdmin users
  try {
    const cookieStore = await cookies();
    const activeCookie = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
    if (activeCookie) {
      const cookieCompanyId = Number(activeCookie);
      if (hasCompanyAccess(verifiedSession, cookieCompanyId)) {
        return cookieCompanyId;
      }
    }
  } catch {
    // cookies() unavailable in non-request contexts
  }

  // 4. Default to first permitted company or 1 for SUPER_ADMIN
  if (verifiedSession.defaultCompanyId) {
    return verifiedSession.defaultCompanyId;
  }

  if (verifiedSession.companyIds.length > 0) {
    return verifiedSession.companyIds[0];
  }

  return 1;
}

/**
 * Verify if a target entity belongs to the user's permitted company
 */
export function assertEntityCompanyAccess(
  session: UserSessionPayload | null,
  entityCompanyId: number
): void {
  const verifiedSession = requireAuth(session);
  if (!hasCompanyAccess(verifiedSession, entityCompanyId)) {
    const error = new Error(
      `Forbidden: Entitas ini dimiliki oleh perusahaan lain (Company ID: ${entityCompanyId}) dan tidak dapat diakses.`
    );
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}
