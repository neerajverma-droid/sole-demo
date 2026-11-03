"use client";

import { useAtom, type PrimitiveAtom } from "jotai";

import { sameValues } from "@/lib/settings";

/**
 * A section's draft, tagged with the business it was edited against.
 *
 * Settings has one business open at a time, but the atom itself doesn't know
 * that — it's a flat piece of client state that outlives switching to a
 * different business. Without the tag, a draft made on business A kept
 * showing (and reporting as "unsaved") after switching to business B, because
 * `draft ?? stored` had no way to tell the two apart. See `stores/
 * preferences.ts` for the same bug, fixed the same way, one layer down.
 */
export type SectionDraft<T> = { businessId: string; values: T } | null;

/**
 * A section's editable copy. The draft atom holds null until something is
 * edited, so it mirrors the store rather than snapshotting it at load — which
 * matters because the persisted store rehydrates after mount.
 *
 * @param businessId the open business, so an edit can be tagged and a stale
 *   one (from a business since switched away from) can be told apart from
 *   the current one and ignored rather than shown.
 */
export function useSectionDraft<T extends object>(
  stored: T,
  draftAtom: PrimitiveAtom<SectionDraft<T>>,
  businessId: string | null,
) {
  const [draft, setDraft] = useAtom(draftAtom);

  const forThisBusiness = Boolean(draft) && draft?.businessId === businessId;
  const values = forThisBusiness ? (draft as { values: T }).values : stored;
  const dirty = forThisBusiness && !sameValues(values, stored);

  return {
    values,
    dirty,
    patch: (partial: Partial<T>) => {
      // No business open means nothing to tag the edit with — same guard
      // `usePreferencesStore.patch` uses, for the same reason.
      if (!businessId) return;
      setDraft({ businessId, values: { ...values, ...partial } });
    },
    /** Drop the draft so the section mirrors the store again. */
    reset: () => setDraft(null),
  };
}
