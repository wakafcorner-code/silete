import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth, requirePermission } from "@/services/rbac-service";
import { resolveCompanyScope, assertEntityCompanyAccess } from "@/services/company-context-service";
import { createAuditLog } from "@/services/audit-service";
import { PERMISSIONS } from "@/config/permissions";
import { PaginationParams, PaginatedResult } from "@/types/pagination";
import { RowDataPacket } from "mysql2/promise";
import { Status } from "@/types";

export interface Employee extends RowDataPacket {
  id: number;
  company_id: number;
  branch_id: number | null;
  employee_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: Status;
  branch_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const EmployeeInputSchema = z.object({
  company_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional().nullable(),
  employee_code: z
    .string()
    .min(2, "Kode karyawan minimal 2 karakter.")
    .max(40, "Kode karyawan maksimal 40 karakter.")
    .regex(/^[A-Za-z0-9\-_.]+$/, "Kode hanya boleh alfanumerik, dash, underscore, atau titik."),
  name: z.string().min(2, "Nama karyawan minimal 2 karakter.").max(150, "Nama maksimal 150 karakter."),
  email: z.string().email("Format email tidak valid.").max(150).optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  position: z.string().max(100).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type EmployeeInput = z.input<typeof EmployeeInputSchema>;

/**
 * List employees with search, filter (branch, status), and pagination
 */
export async function listEmployees(
  session: UserSessionPayload | null,
  params: PaginationParams = {},
  requestedCompanyId?: number | string | null
): Promise<PaginatedResult<Employee>> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["e.company_id = ?"];
  const queryParams: (string | number)[] = [companyId];

  if (params.status && params.status !== "all") {
    conditions.push("e.status = ?");
    queryParams.push(params.status);
  }

  if (params.branchId) {
    conditions.push("e.branch_id = ?");
    queryParams.push(Number(params.branchId));
  }

  if (params.search) {
    conditions.push("(e.employee_code LIKE ? OR e.name LIKE ? OR e.email LIKE ? OR e.position LIKE ?)");
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Total count
  const countSql = `SELECT COUNT(*) as total FROM employees e ${whereClause}`;
  const countRows = await query<RowDataPacket[]>(countSql, queryParams);
  const total = countRows[0] ? Number((countRows[0] as { total: number }).total) : 0;
  const totalPages = Math.ceil(total / limit);

  // Paginated Data with branch name join
  const dataSql = `
    SELECT e.id, e.company_id, e.branch_id, e.employee_code, e.name, e.email, e.phone, 
           e.position, e.status, e.created_at, e.updated_at, b.name as branch_name
    FROM employees e
    LEFT JOIN branches b ON b.id = e.branch_id
    ${whereClause}
    ORDER BY e.id DESC
    LIMIT ? OFFSET ?
  `;
  const data = await query<Employee[]>(dataSql, [...queryParams, limit, offset]);

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
 * Get employee by ID with strict company isolation
 */
export async function getEmployeeById(
  session: UserSessionPayload | null,
  employeeId: number
): Promise<Employee | null> {
  requireAuth(session);

  const employee = await queryOne<Employee>(
    `SELECT e.id, e.company_id, e.branch_id, e.employee_code, e.name, e.email, e.phone, 
            e.position, e.status, e.created_at, e.updated_at, b.name as branch_name
     FROM employees e
     LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.id = ? LIMIT 1`,
    [employeeId]
  );

  if (!employee) return null;

  assertEntityCompanyAccess(session, employee.company_id);
  return employee;
}

/**
 * Create a new employee with duplicate code prevention & audit log
 */
export async function createEmployee(
  session: UserSessionPayload | null,
  input: EmployeeInput,
  requestedCompanyId?: number | string | null
): Promise<{ id: number; company_id: number; employee_code: string; name: string }> {
  requirePermission(session, PERMISSIONS.COMPANY_MANAGE);
  const companyId = await resolveCompanyScope(session, requestedCompanyId || input.company_id);
  const validated = EmployeeInputSchema.parse(input);

  // Check unique employee_code in company
  const existing = await queryOne<Employee>(
    "SELECT id FROM employees WHERE company_id = ? AND employee_code = ? LIMIT 1",
    [companyId, validated.employee_code]
  );
  if (existing) {
    throw new Error(`Kode karyawan '${validated.employee_code}' sudah terdaftar untuk perusahaan ini.`);
  }

  // If branch_id provided, verify branch belongs to same company
  if (validated.branch_id) {
    const branch = await queryOne<RowDataPacket>(
      "SELECT id FROM branches WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.branch_id, companyId]
    );
    if (!branch) {
      throw new Error("Cabang yang dipilih tidak valid atau bukan milik perusahaan ini.");
    }
  }

  const res = await execute(
    `INSERT INTO employees (company_id, branch_id, employee_code, name, email, phone, position, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      validated.branch_id || null,
      validated.employee_code,
      validated.name,
      validated.email || null,
      validated.phone || null,
      validated.position || null,
      validated.status,
    ]
  );

  const employeeId = res.insertId;

  // Audit log
  await createAuditLog({
    companyId,
    userId: session?.userId || null,
    action: "CREATE",
    tableName: "employees",
    recordId: employeeId,
    newValues: { ...validated, id: employeeId, company_id: companyId },
  });

  return {
    id: employeeId,
    company_id: companyId,
    employee_code: validated.employee_code,
    name: validated.name,
  };
}

/**
 * Update an employee with duplicate code prevention & audit log
 */
export async function updateEmployee(
  session: UserSessionPayload | null,
  employeeId: number,
  input: Partial<EmployeeInput>
): Promise<void> {
  requirePermission(session, PERMISSIONS.COMPANY_MANAGE);
  const current = await getEmployeeById(session, employeeId);
  if (!current) {
    throw new Error("Karyawan tidak ditemukan.");
  }

  const updatedData = {
    ...current,
    ...input,
  };
  const validated = EmployeeInputSchema.parse(updatedData);

  // Check code uniqueness if changed
  if (validated.employee_code !== current.employee_code) {
    const existing = await queryOne<Employee>(
      "SELECT id FROM employees WHERE company_id = ? AND employee_code = ? AND id != ? LIMIT 1",
      [current.company_id, validated.employee_code, employeeId]
    );
    if (existing) {
      throw new Error(`Kode karyawan '${validated.employee_code}' sudah digunakan.`);
    }
  }

  // Verify branch ownership
  if (validated.branch_id && validated.branch_id !== current.branch_id) {
    const branch = await queryOne<RowDataPacket>(
      "SELECT id FROM branches WHERE id = ? AND company_id = ? LIMIT 1",
      [validated.branch_id, current.company_id]
    );
    if (!branch) {
      throw new Error("Cabang yang dipilih tidak valid untuk perusahaan ini.");
    }
  }

  await execute(
    `UPDATE employees SET 
       branch_id = ?, employee_code = ?, name = ?, email = ?, 
       phone = ?, position = ?, status = ?, updated_at = NOW()
     WHERE id = ? AND company_id = ?`,
    [
      validated.branch_id || null,
      validated.employee_code,
      validated.name,
      validated.email || null,
      validated.phone || null,
      validated.position || null,
      validated.status,
      employeeId,
      current.company_id,
    ]
  );

  // Audit log
  await createAuditLog({
    companyId: current.company_id,
    userId: session?.userId || null,
    action: "UPDATE",
    tableName: "employees",
    recordId: employeeId,
    oldValues: { ...current },
    newValues: { ...validated },
  });
}
