"use client";

import { useSearchParams } from "next/navigation";

/**
 * Deep-link intent: `?new=1` means the user came from a "Create new" entry
 * point and the screen must open its creation UI immediately on mount,
 * rather than landing them on the list view.
 */
export function useCreateIntent(): boolean {
  const searchParams = useSearchParams();
  return searchParams?.get("new") === "1";
}
