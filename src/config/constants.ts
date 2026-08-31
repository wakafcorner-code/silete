/**
 * ERP Manajemen - System Constants
 */

export const APP_CONFIG = {
  name: "SILETE",
  version: "1.0.0",
  description: "Multi-Company ERP & Financial Management System",
  defaultCurrency: "IDR",
  defaultTimezone: "Asia/Jakarta",
  pagination: {
    defaultPageSize: 15,
    pageSizeOptions: [10, 15, 25, 50, 100],
  },
} as const;

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  FINANCE: "FINANCE",
  WAREHOUSE_ADMIN: "WAREHOUSE_ADMIN",
  PURCHASING: "PURCHASING",
  SALES: "SALES",
  AUDITOR: "AUDITOR",
} as const;

export const TRANSACTION_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  POSTED: "posted",
  CANCELLED: "cancelled",
} as const;
