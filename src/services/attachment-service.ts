/**
 * ERP Manajemen — Attachment Service (Phase 16)
 *
 * File attachment handling for ERP documents (Purchase Orders, Expenses, Invoices, Delivery, Assets).
 */

import { execute, query, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth } from "@/services/rbac-service";
import { resolveCompanyScope } from "@/services/company-context-service";
import { logAudit } from "@/services/audit-service";
import { Attachment } from "@/types";

export interface CreateAttachmentInput {
  reference_type: string;
  reference_id: number;
  category?: string | null;
  notes?: string | null;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  file_size?: number | null;
}

export async function createAttachment(
  session: UserSessionPayload | null,
  input: CreateAttachmentInput,
  requestedCompanyId?: number | string | null
): Promise<number> {
  requireAuth(session);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);
  const userId = session?.userId ? Number(session.userId) : null;

  // Maximum file size: 25MB
  if (input.file_size && input.file_size > 25 * 1024 * 1024) {
    throw new Error("File size exceeds maximum allowed limit of 25MB");
  }

  const result = await execute(
    `INSERT INTO attachments (company_id, reference_type, reference_id, category, notes, file_name, file_path, mime_type, file_size, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      companyId,
      input.reference_type,
      input.reference_id,
      input.category || null,
      input.notes || null,
      input.file_name,
      input.file_path,
      input.mime_type || null,
      input.file_size || null,
      userId,
    ]
  );

  const attachmentId = result.insertId;

  await logAudit({
    user_id: userId,
    company_id: companyId,
    action: "UPLOAD_ATTACHMENT",
    module: "attachments",
    entity: input.reference_type,
    entity_id: input.reference_id,
    new_values: {
      attachment_id: attachmentId,
      file_name: input.file_name,
      file_size: input.file_size,
    },
  });

  return attachmentId;
}

export async function listEntityAttachments(
  session: UserSessionPayload | null,
  referenceType: string,
  referenceId: number,
  requestedCompanyId?: number | string | null
): Promise<Attachment[]> {
  requireAuth(session);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  return query<Attachment[]>(
    `SELECT id, company_id, reference_type, reference_id, category, notes, file_name, file_path, mime_type, file_size, uploaded_by, created_at
     FROM attachments
     WHERE company_id = ? AND reference_type = ? AND reference_id = ?
     ORDER BY id ASC`,
    [companyId, referenceType, referenceId]
  );
}

export async function listDocumentationAttachments(
  session: UserSessionPayload | null,
  category?: string | null,
  requestedCompanyId?: number | string | null
): Promise<Attachment[]> {
  requireAuth(session);
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  let sql = `SELECT id, company_id, reference_type, reference_id, category, notes, file_name, file_path, mime_type, file_size, uploaded_by, created_at
             FROM attachments
             WHERE company_id = ?`;
  const params: any[] = [companyId];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY created_at DESC`;

  return query<Attachment[]>(sql, params);
}

export async function deleteAttachment(
  session: UserSessionPayload | null,
  attachmentId: number
): Promise<void> {
  requireAuth(session);
  const userId = session?.userId ? Number(session.userId) : null;

  const att = await queryOne<Attachment>(
    "SELECT id, company_id, reference_type, reference_id, file_name FROM attachments WHERE id = ?",
    [attachmentId]
  );

  if (!att) {
    throw new Error("Attachment not found");
  }

  await execute("DELETE FROM attachments WHERE id = ?", [attachmentId]);

  await logAudit({
    user_id: userId,
    company_id: att.company_id,
    action: "DELETE_ATTACHMENT",
    module: "attachments",
    entity: att.reference_type,
    entity_id: att.reference_id,
    old_values: {
      attachment_id: attachmentId,
      file_name: att.file_name,
    },
  });
}
