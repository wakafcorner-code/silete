import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { createAuditLog } from "@/services/audit-service";
import { PERMISSIONS } from "@/config/permissions";
import { PaginationParams, PaginatedResult } from "@/types/pagination";
import { Status } from "@/types";
import { Prisma, suppliers_status } from "@prisma/client";

export interface Supplier {
  id: number;
  company_id: number;
  code: string;
  name: string;
  tax_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms_days: number;
  status: Status;
  created_at: string;
  updated_at: string;
}

export const SupplierInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  code: z
    .string()
    .min(2, "Kode pemasok minimal 2 karakter.")
    .max(40, "Kode pemasok maksimal 40 karakter.")
    .regex(/^[A-Za-z0-9\-_.]+$/, "Kode hanya boleh alfanumerik, dash, underscore, atau titik."),
  name: z.string().min(2, "Nama pemasok minimal 2 karakter.").max(150, "Nama maksimal 150 karakter."),
  tax_number: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Format email tidak valid.").max(150).optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  payment_terms_days: z.number().int().nonnegative().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type SupplierInput = z.input<typeof SupplierInputSchema>;

/**
 * Helper to map Prisma supplier to Supplier type
 */
function mapSupplier(s: any): Supplier {
  return {
    ...s,
    id: Number(s.id),
    company_id: Number(s.company_id),
    created_at: s.created_at.toISOString(),
    updated_at: s.updated_at.toISOString(),
    status: s.status as Status,
  };
}

/**
 * List suppliers with search, filter, and pagination strictly scoped to authorized company
 */
export async function listSuppliers(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Supplier>> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.suppliersWhereInput = {
    company_id: BigInt(companyId),
  };

  if (params.status && params.status !== "all") {
    where.status = params.status as suppliers_status;
  }

  if (params.search) {
    where.OR = [
      { code: { contains: params.search } },
      { name: { contains: params.search } },
      { phone: { contains: params.search } },
      { email: { contains: params.search } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.suppliers.count({ where }),
    prisma.suppliers.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit,
      skip: skip,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: data.map(mapSupplier),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get supplier by ID with strict company isolation
 */
export async function getSupplierById(
  session: UserSessionPayload | null,
  supplierId: number
): Promise<Supplier | null> {
  requireAuth(session);

  const supplier = await prisma.suppliers.findUnique({
    where: { id: BigInt(supplierId) },
  });

  if (!supplier) return null;

  assertEntityCompanyAccess(session, Number(supplier.company_id));
  return mapSupplier(supplier);
}

/**
 * Create a new supplier with duplicate code prevention & audit log
 */
export async function createSupplier(
  session: UserSessionPayload | null,
  input: SupplierInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; code: string; name: string }> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = SupplierInputSchema.parse(input);

  // Duplicate code prevention within same company
  const existing = await prisma.suppliers.findUnique({
    where: {
      company_id_code: {
        company_id: BigInt(companyId),
        code: validated.code,
      },
    },
  });

  if (existing) {
    throw new Error(`Kode pemasok '${validated.code}' sudah terdaftar untuk perusahaan ini.`);
  }

  const res = await prisma.suppliers.create({
    data: {
      company_id: BigInt(companyId),
      code: validated.code,
      name: validated.name,
      tax_number: validated.tax_number,
      phone: validated.phone,
      email: validated.email,
      address: validated.address,
      payment_terms_days: validated.payment_terms_days,
      status: validated.status as suppliers_status,
    },
  });

  const supplierId = Number(res.id);

  // Audit log
  await createAuditLog({
    companyId,
    userId: session?.userId || null,
    action: "CREATE",
    tableName: "suppliers",
    recordId: supplierId,
    newValues: { ...validated, id: supplierId, company_id: companyId },
  });

  return {
    id: supplierId,
    company_id: companyId,
    code: res.code,
    name: res.name,
  };
}

/**
 * Update a supplier with duplicate code prevention & audit log
 */
export async function updateSupplier(
  session: UserSessionPayload | null,
  supplierId: number,
  input: Partial<SupplierInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.PURCHASING_MANAGE);
  const current = await getSupplierById(session, supplierId);
  if (!current) {
    throw new Error("Pemasok tidak ditemukan.");
  }

  const updatedData = {
    ...current,
    ...input,
  };
  const validated = SupplierInputSchema.parse(updatedData);

  // Check code uniqueness if changed
  if (validated.code !== current.code) {
    const existing = await prisma.suppliers.findFirst({
      where: {
        company_id: BigInt(current.company_id),
        code: validated.code,
        NOT: { id: BigInt(supplierId) },
      },
    });
    if (existing) {
      throw new Error(`Kode pemasok '${validated.code}' sudah digunakan oleh pemasok lain.`);
    }
  }

  await prisma.suppliers.update({
    where: { id: BigInt(supplierId) },
    data: {
      code: validated.code,
      name: validated.name,
      tax_number: validated.tax_number,
      phone: validated.phone,
      email: validated.email,
      address: validated.address,
      payment_terms_days: validated.payment_terms_days,
      status: validated.status as suppliers_status,
      updated_at: new Date(),
    },
  });

  // Audit log
  await createAuditLog({
    companyId: current.company_id,
    userId: session?.userId || null,
    action: "UPDATE",
    tableName: "suppliers",
    recordId: supplierId,
    oldValues: { ...current },
    newValues: { ...validated },
  });
}
