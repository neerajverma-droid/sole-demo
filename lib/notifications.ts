/**
 * The bell's feed — sole-ocr's `GET /v2/user/notification`.
 *
 * The bell used to render three hardcoded rows (an overdue invoice, a bank feed
 * sync, a BAS reminder) for every account, which is why a brand-new account was
 * told it had an overdue invoice and two different accounts saw the same feed.
 * The server keeps a real per-user feed; this reads it.
 *
 * Two behaviours of that endpoint shape everything below:
 *
 * - A plain GET marks every unread notification for the user as read, as a side
 *   effect. Listing therefore always sends `no_read_update=1`, so opening the
 *   app doesn't silently clear the badge; only `markAllNotificationsRead`
 *   omits it.
 * - `is_read` and ids come back as strings (`"1"`/`"0"`), so they're normalised
 *   once here rather than at each use.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiNotification = {
  notification_id: string | number;
  title?: string | null;
  message?: string | null;
  notification_date?: string | null;
  is_read?: string | number | boolean | null;
};

type ApiNotificationPage = {
  notification_details?: ApiNotification[];
  total?: number;
};

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  /** ISO timestamp, or "" when the server didn't record one. */
  date: string;
  read: boolean;
};

export type NotificationFeed = {
  items: AppNotification[];
  /** Everything the server holds for the user, not just what's in `items`. */
  total: number;
};

/** How many the popover lists. The server paginates; the bell shows the latest. */
export const NOTIFICATION_PAGE_SIZE = 10;

export function mapNotification(raw: ApiNotification): AppNotification {
  const read = raw.is_read === true || raw.is_read === 1 || raw.is_read === "1";
  return {
    id: String(raw.notification_id),
    title: (raw.title ?? "").trim(),
    message: (raw.message ?? "").trim(),
    date: raw.notification_date ?? "",
    read,
  };
}

export function unreadCount(items: AppNotification[]): number {
  return items.filter((item) => !item.read).length;
}

export async function fetchNotificationFeed(): Promise<NotificationFeed> {
  const response = await api.get<ApiEnvelope<ApiNotificationPage>>(
    apiRoutes.user.notification,
    {
      params: { page: 1, page_size: NOTIFICATION_PAGE_SIZE, no_read_update: 1 },
    },
  );
  const page = response.data?.data;
  const items = (page?.notification_details ?? []).map(mapNotification);
  return { items, total: page?.total ?? items.length };
}

/**
 * The server has no dedicated mark-read route; a listing without
 * `no_read_update` is what clears the flag, for every page of the user's feed.
 * One row is asked for since the body is discarded.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const response = await api.get<ApiEnvelope<unknown>>(
    apiRoutes.user.notification,
    { params: { page: 1, page_size: 1 } },
  );
  if (response.data?.success === false) {
    throw new Error(
      response.data.message || "Couldn't mark notifications read.",
    );
  }
}
