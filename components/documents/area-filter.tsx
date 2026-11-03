"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, X } from "lucide-react";

import { areaDisplayName } from "@/lib/customer-areas";

/**
 * The area a list has been narrowed to, read straight from the URL.
 *
 * Deliberately not an atom: the filter arrives by link from Geographic
 * insights, and a stored one would outlive the link — open Invoices again
 * later and you'd be looking at one suburb's invoices with nothing on screen
 * saying why. The URL is the whole state, so leaving the page clears it and
 * the filtered view stays shareable.
 */
export function useAreaFilter(): string | null {
  return useSearchParams()?.get("area")?.trim() || null;
}

/**
 * Says which area the list is showing, and takes it off. Without this the
 * filter would be invisible — a list quietly missing most of its rows.
 */
export function AreaFilterChip({ area }: { area: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();

  const clear = () => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("area");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 py-1 pl-3 pr-1.5 text-sm text-primary">
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      {areaDisplayName(area)}
      <button
        type="button"
        onClick={clear}
        aria-label={`Clear the ${areaDisplayName(area)} filter`}
        className="rounded-full p-0.5 outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
