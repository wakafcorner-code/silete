/**
 * ERP Manajemen — Settings & Document Numbering Service (Phase 16)
 *
 * Configurable system settings, document numbering format generator, and approval thresholds.
 */

import { execute, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requirePermission, requireRole } from "@/services/rbac-service";
import { resolveCompanyScope } from "@/services/company-context-service";
import { PERMISSIONS } from "@/config/permissions";
import { logAudit } from "@/services/audit-service";

export interface SystemSettingRecord {
  id: number;
  company_id: number | null;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  description: string | null;
  updated_at: string;
}

export interface DocumentNumberConfig {
  prefix: string;
  digits: number;
  includeYearMonth: boolean;
  separator: string;
}

export interface ApprovalThresholdConfig {
  expense_director_threshold: number;
  po_director_threshold: number;
  requires_multi_level_approval: boolean;
}

// Default Settings Mapping
const DEFAULT_NUMBERING: Record<string, DocumentNumberConfig> = {
  SALES_ORDER: { prefix: "SO", digits: 5, includeYearMonth: true, separator: "/" },
  PURCHASE_ORDER: { prefix: "PO", digits: 5, includeYearMonth: true, separator: "/" },
  CUSTOMER_INVOICE: { prefix: "INV", digits: 5, includeYearMonth: true, separator: "/" },
  SUPPLIER_INVOICE: { prefix: "BILL", digits: 5, includeYearMonth: true, separator: "/" },
  DELIVERY_ORDER: { prefix: "DO", digits: 5, includeYearMonth: true, separator: "/" },
  GOODS_RECEIPT: { prefix: "GRN", digits: 5, includeYearMonth: true, separator: "/" },
  JOURNAL_ENTRY: { prefix: "JV", digits: 5, includeYearMonth: true, separator: "/" },
  PAYMENT: { prefix: "PAY", digits: 5, includeYearMonth: true, separator: "/" },
};

const DEFAULT_APPROVAL: ApprovalThresholdConfig = {
  expense_director_threshold: 50000000, // 50 Million IDR
  po_director_threshold: 100000000,    // 100 Million IDR
  requires_multi_level_approval: true,
};

export async function getSystemSetting<T>(
  companyId: number | null,
  settingKey: string,
  defaultValue: T
): Promise<T> {
  const row = await queryOne<{ setting_value: string }>(
    "SELECT setting_value FROM system_settings WHERE (company_id = ? OR company_id IS NULL) AND setting_key = ? ORDER BY company_id DESC LIMIT 1",
    [companyId, settingKey]
  );

  if (!row) return defaultValue;
  try {
    return JSON.parse(row.setting_value) as T;
  } catch {
    return (row.setting_value as unknown) as T;
  }
}

export async function setSystemSetting(
  session: UserSessionPayload | null,
  companyId: number | null,
  settingKey: string,
  settingValue: unknown,
  settingGroup: string,
  description?: string
): Promise<void> {
  requireRole(session, ["SUPER_ADMIN", "ADMIN", "OWNER"]);
  const userId: number | null = session?.user_id ? Number(session.user_id) : null;
  const valStr = typeof settingValue === "string" ? settingValue : JSON.stringify(settingValue);

  await execute(
    `INSERT INTO system_settings (company_id, setting_key, setting_value, setting_group, description, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [companyId, settingKey, valStr, settingGroup, description || null, userId]
  );

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "UPDATE_SYSTEM_SETTING",
    module: "settings",
    entity: settingGroup,
    new_values: { setting_key: settingKey, value: valStr },
  });
}

export async function getDocumentNumber(
  companyId: number,
  documentType: keyof typeof DEFAULT_NUMBERING,
  customDate?: Date
): Promise<string> {
  const cfg = await getSystemSetting<DocumentNumberConfig>(
    companyId,
    `DOC_NUM_${documentType}`,
    DEFAULT_NUMBERING[documentType] || { prefix: "DOC", digits: 5, includeYearMonth: true, separator: "/" }
  );

  const date = customDate || new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const periodStr = `${yyyy}${mm}`;

  // In Next.js/MySQL: Query count of existing documents in this period
  let seq = 1;
  const countRow = await queryOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM journal_entries WHERE company_id = ? AND YEAR(journal_date) = ? AND MONTH(journal_date) = ?",
    [companyId, yyyy, date.getMonth() + 1]
  );
  seq = Number(countRow?.c || 0) + 1;

  const seqStr = String(seq).padStart(cfg.digits, "0");
  if (cfg.includeYearMonth) {
    return `${cfg.prefix}${cfg.separator}${periodStr}${cfg.separator}${seqStr}`;
  }
  return `${cfg.prefix}${cfg.separator}${seqStr}`;
}

export async function getApprovalThresholds(
  session: UserSessionPayload | null,
  requestedCompanyId?: number | string | null
): Promise<ApprovalThresholdConfig> {
  requirePermission(session, PERMISSIONS.FINANCE_VIEW);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return getSystemSetting<ApprovalThresholdConfig>(
    companyId,
    "APPROVAL_THRESHOLDS",
    DEFAULT_APPROVAL
  );
}
