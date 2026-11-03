"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { toast } from "sonner";

import { focusFirstIssue, type OnboardingIssues } from "@/components/payments/shared/onboarding-fields";
import { NEXXTAP_OVERVIEW_HREF } from "@/components/payments/nexxtap/onboarding-shell";
import { apiErrorMessage } from "@/lib/api-error";
import { nexxtapHydratedAtom, nexxtapOnboardingAtom } from "@/lib/atoms";
import {
  parseNexxtapErrors,
  saveNexxtapStep,
  type NexxtapOnboarding,
  type NexxtapStepId,
} from "@/lib/nexxtap";

/**
 * Whether an issue key's field has something in it — `"abn"` on a section,
 * `"0.email"` on the owners list.
 */
export function hasValueAt(draft: unknown, key: string): boolean {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node != null && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      draft,
    );
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? "").trim().length > 0;
}

/**
 * Which issues to show, given what the merchant has done so far.
 *
 * Everything once Save has been pressed. Before that:
 *  - a field they've left (blurred) shows its problem, and keeps updating live;
 *  - a field that already has a value — usually prefilled from the business
 *    profile, or a saved draft — shows its problem straight away, so a bad
 *    prefill isn't discovered only on Save;
 *  - but never the field they're typing in right now, which would flag a
 *    phone number as "too short" from its first digit.
 */
export function visibleIssues(
  all: OnboardingIssues,
  {
    draft,
    touched,
    focusedKeys,
    showAll,
  }: {
    draft: unknown;
    touched: ReadonlySet<string>;
    focusedKeys: readonly string[];
    showAll: boolean;
  },
): OnboardingIssues {
  if (showAll) return all;
  return Object.fromEntries(
    Object.entries(all).filter(
      ([key]) =>
        touched.has(key) ||
        (hasValueAt(draft, key) && !focusedKeys.includes(key)),
    ),
  );
}

/** Popovers (selects, date pickers) take focus without the field being left. */
const isInsidePopover = (element: Element | null) =>
  Boolean(
    element?.closest?.(
      '[data-radix-popper-content-wrapper],[role="listbox"],[role="dialog"]',
    ),
  );

/**
 * The half of every NextTap step form that isn't its fields.
 *
 * Six step pages that each kept their own copy of "seed a local draft,
 * validate as the merchant goes, save just this section, go back to the
 * overview" would be six places for that behaviour to drift. The fields
 * differ per step; none of this does.
 *
 * The draft is local until Save, which is what makes Cancel honest — leaving
 * a step changes nothing.
 *
 * Spread `fieldEvents` on the element wrapping the step's fields: focus and
 * blur bubble up to it, and the target's id is mapped back to its issue key
 * through `fieldIds`.
 */
export function useNexxtapStepForm<T>({
  stepId,
  select,
  merge,
  validate,
  fieldIds,
  savedMessage,
}: {
  stepId: NexxtapStepId;
  /** This step's slice of the shared application state. */
  select: (state: NexxtapOnboarding) => T;
  /** Puts an edited slice back, producing the state that gets saved. */
  merge: (state: NexxtapOnboarding, draft: T) => NexxtapOnboarding;
  validate: (draft: T) => OnboardingIssues;
  /** Where each issue key's control lives on the page, for scroll-to-error. */
  fieldIds: Record<string, string>;
  savedMessage: string;
}) {
  const router = useRouter();
  const [state, setState] = useAtom(nexxtapOnboardingAtom);
  const [hydrated] = useAtom(nexxtapHydratedAtom);

  const [draft, setDraft] = React.useState<T>(() => select(state));
  const [saving, setSaving] = React.useState(false);
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(new Set());
  const [focusedKeys, setFocusedKeys] = React.useState<readonly string[]>([]);
  /**
   * Field errors the service sent back from the last Save — its rules are
   * mirrored here, but if they ever drift the merchant still sees the message
   * on the field rather than only in a toast. Cleared by the next edit.
   */
  const [serverIssues, setServerIssues] = React.useState<OnboardingIssues>({});

  /*
   * The shell fetches the real application after this form has already
   * mounted, so the first render seeds from empty defaults. Re-seeding on
   * hydration is what puts the saved answers on screen — and it only ever
   * happens once, because `hydrated` never goes back to false.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || seeded.current) return;
    seeded.current = true;
    setDraft(select(state));
    // `select` is redefined every render by the caller; depending on it here
    // would re-run this on every keystroke and throw the edits away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state]);

  /** Element id → the issue keys it shows (one id can carry several). */
  const keysById = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [key, id] of Object.entries(fieldIds)) {
      map.set(id, [...(map.get(id) ?? []), key]);
    }
    return map;
  }, [fieldIds]);

  // Validated on every change, so a message appears or clears the moment the
  // value changes — not on the next Save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allIssues = React.useMemo(() => validate(draft), [draft]);

  const issues = React.useMemo(
    () => ({
      ...serverIssues,
      ...visibleIssues(allIssues, {
        draft,
        touched,
        focusedKeys,
        showAll: triedSubmit,
      }),
    }),
    [allIssues, serverIssues, draft, touched, focusedKeys, triedSubmit],
  );

  const update = React.useCallback((next: T) => {
    setDraft(next);
    setServerIssues({});
  }, []);

  const fieldEvents = React.useMemo(
    () => ({
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        setFocusedKeys(keysById.get(event.target.id) ?? []);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        if (isInsidePopover(event.relatedTarget as Element | null)) return;
        const keys = keysById.get(event.target.id);
        setFocusedKeys([]);
        if (!keys?.length) return;
        setTouched((current) => {
          if (keys.every((key) => current.has(key))) return current;
          return new Set([...current, ...keys]);
        });
      },
    }),
    [keysById],
  );

  const save = async () => {
    setTriedSubmit(true);

    if (Object.keys(allIssues).length > 0) {
      const count = Object.keys(allIssues).length;
      toast.error(
        `${count} ${count === 1 ? "field needs" : "fields need"} attention`,
      );
      focusFirstIssue(allIssues, fieldIds);
      return;
    }

    const next = merge(state, draft);
    setSaving(true);
    try {
      await saveNexxtapStep(stepId, next);
      setState(next);
      toast.success(savedMessage);
      router.push(NEXXTAP_OVERVIEW_HREF);
    } catch (error) {
      const { fieldErrors } = parseNexxtapErrors(error);
      const onThisStep = Object.fromEntries(
        fieldErrors
          .filter((fieldError) => fieldIds[fieldError.key])
          .map((fieldError) => [fieldError.key, fieldError.messages[0]]),
      );
      setServerIssues(onThisStep);
      focusFirstIssue(onThisStep, fieldIds);
      toast.error(apiErrorMessage(error, "Couldn't save this section"));
    } finally {
      setSaving(false);
    }
  };

  return { draft, setDraft: update, issues, saving, save, fieldEvents };
}
