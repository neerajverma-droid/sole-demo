"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useMarkAllNotificationsReadMutation,
  useNotificationsQuery,
} from "@/hooks/use-notifications-query";
import { unreadCount } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function when(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return `${formatDistanceToNowStrict(date)} ago`;
}

/**
 * The bell. Reads the signed-in user's own feed, so an account with nothing to
 * report shows an empty list and no dot rather than somebody else's alerts.
 */
export function Notifications() {
  const feed = useNotificationsQuery();
  const markAllRead = useMarkAllNotificationsReadMutation();

  const items = feed.data?.items ?? [];
  const unread = unreadCount(items);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell className="text-muted-foreground" />
          {unread > 0 && (
            <span
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-foreground"
              aria-hidden
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <button
            type="button"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className="text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:pointer-events-none disabled:no-underline disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>

        {feed.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : feed.isError && items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load notifications.
            </p>
            <button
              type="button"
              onClick={() => feed.refetch()}
              className="mt-1 text-xs font-medium underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <BellOff className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex gap-2.5 border-b px-4 py-3 last:border-b-0"
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    item.read ? "bg-muted-foreground/30" : "bg-foreground",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">
                    {item.title || item.message}
                  </p>
                  {item.title && item.message && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {item.message}
                    </p>
                  )}
                  {when(item.date) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {when(item.date)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
