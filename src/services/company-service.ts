import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Company } from "@/types";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requireRole, requirePermission } from "@/services/rbac-service";
import { assertEntityCompanyAccess } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { companies_status } from "@prisma/client";

export const CompanyInputSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(2).max(255),
  legal_name: z.string().max(255).optional().nullable(),
  tax_number: z.string().max(100).optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(100).optional().nullable(),
  currency_code: z.string().min(3).max(10).default("IDR"),
  timezone: z.string().min(3).max(50).default("Asia/Jakarta"),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type CompanyInput = z.infer<typeof CompanyInputSchema>;

/**
 * Helper to map Prisma company to Company type
 */
function mapCompany(comp: any): Company {
  return {
    ...comp,
    id: Number(comp.id),
    created_at: comp.created_at.toISOString(),
    updated_at: comp.updated_at.toISOString(),
  };
}

/**
 * List all companies accessible by the authenticated user
 */
export async function listPermittedCompanies(
  session: UserSessionPayload | null
): Promise<Company[]> {
  const verified = requireAuth(session);

  if (verified.roles.includes("SUPER_ADMIN")) {
    const rows = await prisma.companies.findMany({
      orderBy: { id: "asc" },
    });
    return rows.map(mapCompany);
  }

  if (verified.companyIds.length === 0) {
    return [];
  }

  const rows = await prisma.companies.findMany({
    where: {
      id: { in: verified.companyIds.map(id => BigInt(id)) },
      status: "active",
    },
    orderBy: { id: "asc" },
  });

  return rows.map(mapCompany);
}

/**
 * Get a single company by ID with strict access authorization
 */
export async function getCompanyById(
  session: UserSessionPayload | null,
  companyId: number
): Promise<Company | null> {
  requireAuth(session);
  assertEntityCompanyAccess(session, companyId);

  const comp = await prisma.companies.findUnique({
    where: { id: BigInt(companyId) },
  });

  return comp ? mapCompany(comp) : null;
}

/**
 * Create a new company (SUPER_ADMIN only)
 */
export async function createCompany(
  session: UserSessionPayload | null,
  input: CompanyInput
): Promise<{ id: number; code: string; name: string }> {
  requireRole(session, "SUPER_ADMIN");
  const validated = CompanyInputSchema.parse(input);

  const res = await prisma.companies.create({
    data: {
      code: validated.code,
      name: validated.name,
      legal_name: validated.legal_name,
      tax_number: validated.tax_number,
      address: validated.address,
      phone: validated.phone,
      email: validated.email,
      currency_code: validated.currency_code,
      timezone: validated.timezone,
      status: validated.status as companies_status,
    },
  });

  return {
    id: Number(res.id),
    code: res.code,
    name: res.name,
  };
}

/**
 * Update an existing company
 */
export async function updateCompany(
  session: UserSessionPayload | null,
  companyId: number,
  input: Partial<CompanyInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.COMPANY_MANAGE);
  assertEntityCompanyAccess(session, companyId);

  const current = await getCompanyById(session, companyId);
  if (!current) {
    throw new Error("Perusahaan tidak ditemukan.");
  }

  // Zod validation on merged data
  const updatedData = {
    ...current,
    ...input,
  };
  const validated = CompanyInputSchema.parse(updatedData);

  await prisma.companies.update({
    where: { id: BigInt(companyId) },
    data: {
      name: validated.name,
      legal_name: validated.legal_name,
      tax_number: validated.tax_number,
      address: validated.address,
      phone: validated.phone,
      email: validated.email,
      currency_code: validated.currency_code,
      timezone: validated.timezone,
      status: validated.status as companies_status,
      updated_at: new Date(),
    },
  });
}
