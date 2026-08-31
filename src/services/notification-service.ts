/**
 * ERP Manajemen — Notification Service (Phase 16)
 *
 * Provides in-app alerts for pending approvals, postings, and critical financial milestones.
 */

import { execute, query, queryOne } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { requireAuth } from "@/services/rbac-service";
import { PaginatedResult, PaginationParams } from "@/types/pagination";
import { Notification } from "@/types";

export async function createNotification(params: {
  user_id: number;
  company_id?: number | null;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  reference_type?: string | null;
  reference_id?: number | null;
}): Promise<number> {
  const result = await execute(
    `INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      params.user_id,
      params.title,
      params.message,
      params.type || 'info',
      params.reference_type || null,
      params.reference_id || null,
    ]
  );
  return result.insertId;
}

export async function listUserNotifications(
  session: UserSessionPayload | null,
  params: PaginationParams = {}
): Promise<PaginatedResult<Notification> & { unread_count: number }> {
  requireAuth(session);
  const userId = Number(session!.user_id);
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const countRow = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?",
    [userId]
  );
  const unreadRow = await queryOne<{ unread: number }>(
    "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL",
    [userId]
  );

  const total = Number(countRow?.total || 0);
  const unread_count = Number(unreadRow?.unread || 0);
  const totalPages = Math.ceil(total / limit);

  const rows = await query<Notification[]>(
    `SELECT id, user_id, title, message, type, reference_type, reference_id, read_at, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    unread_count,
  };
}

export async function markNotificationAsRead(
  session: UserSessionPayload | null,
  notificationId: number
): Promise<void> {
  requireAuth(session);
  const userId = Number(session!.user_id);

  await execute(
    "UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?",
    [notificationId, userId]
  );
}

export async function markAllNotificationsAsRead(
  session: UserSessionPayload | null
): Promise<void> {
  requireAuth(session);
  const userId = Number(session!.user_id);

  await execute(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL",
    [userId]
  );
}
