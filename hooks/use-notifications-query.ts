"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchNotificationFeed,
  markAllNotificationsRead,
  type NotificationFeed,
} from "@/lib/notifications";

const KEY = ["notifications"] as const;

/** How often the bell re-checks while the tab is open. */
const POLL_MS = 60_000;

/**
 * The signed-in user's notification feed.
 *
 * The cache is dropped on sign-out (`lib/api/teardown.ts` clears React Query),
 * so a second account in the same tab never starts from the first one's feed.
 */
export function useNotificationsQuery() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchNotificationFeed,
    refetchInterval: POLL_MS,
  });
}

/** Optimistic: the badge clears at once and rolls back if the server refuses. */
export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<NotificationFeed>(KEY);
      if (previous) {
        queryClient.setQueryData<NotificationFeed>(KEY, {
          ...previous,
          items: previous.items.map((item) => ({ ...item, read: true })),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
