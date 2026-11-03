import type { MigrationRoute } from "@/lib/welcome";

/**
 * "Switching From" — what the user kept their books in before Sole.
 *
 * Ported from `sole-webapp/config/joinFromOptions.js`. Source stores the
 * chosen value directly as `users.join_from` (`VARCHAR(20)`) with no `id`
 * concept of its own — the chip's label *is* the value saved. This port adds
 * a stable `id` per option (for React keys and store state) alongside the
 * original `label`, which stays exactly source's string and is what should
 * travel to the API in `join_from`'s place.
 *
 * Note from source, still true here: `components/SoleCommandAuth/AuthContent.js`
 * (accountant signup) carries its own, already-drifted copy of this list (no
 * "First time user", no "Myob") — left alone there for the same reason source
 * left it alone, so this file doesn't touch that form.
 */
export type JoinFromOption = {
  id: string;
  label: string;
};

export const JOIN_FROM_OPTIONS: JoinFromOption[] = [
  { id: "first-time-user", label: "First time user" },
  { id: "spreadsheets", label: "Spreadsheets" },
  { id: "xero", label: "Xero" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "rounded", label: "Rounded" },
  { id: "okke", label: "Okke" },
  { id: "hnry", label: "Hnry" },
  { id: "myob", label: "Myob" },
];

/**
 * The option an answer names, whichever form it arrived in.
 *
 * The survey popup stores the chosen option's `label` (that's the value
 * `users.join_from` holds), while other callers pass the `id`. Matching both,
 * case-insensitively, is what lets one stored answer drive every lookup below.
 */
export function findJoinFromOption(value: string): JoinFromOption | undefined {
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  return JOIN_FROM_OPTIONS.find(
    (option) => option.id === needle || option.label.toLowerCase() === needle,
  );
}

/**
 * What migrating from this answer would actually involve — the same
 * vocabulary `lib/welcome.ts`'s `CURRENT_SYSTEM` uses (`MigrationRoute`,
 * imported rather than redefined so the two stay one type).
 *
 * - Xero, QuickBooks, Myob → `direct`: platforms this app can build a real
 *   importer for.
 * - Spreadsheets → `spreadsheet`, the CSV-shaped import path.
 * - First time user → `none`: no history, nothing to migrate.
 * - Rounded, Okke, Hnry → `file`: real tools with an export, but not ones this
 *   app has a direct connection to — best judgement, same tier as source's own
 *   "Another accounting app" / "An invoicing app, not full accounting" rows.
 *
 * Takes an option's `id` or its `label` (see `findJoinFromOption`). Meant to
 * replace `currentSystem` as the acknowledgment step's migration-route
 * source (see the plan this file was written against) — unknown ids fall back
 * to `file` rather than throwing, since an unrecognised answer is still
 * something to offer a generic import for rather than nothing.
 */
export function migrationRouteForJoinFrom(value: string): MigrationRoute {
  switch (findJoinFromOption(value)?.id ?? value) {
    case "first-time-user":
      return "none";
    case "spreadsheets":
      return "spreadsheet";
    case "xero":
    case "quickbooks":
    case "myob":
      return "direct";
    case "rounded":
    case "okke":
    case "hnry":
      return "file";
    default:
      return "file";
  }
}

/**
 * Whether this answer means there's existing data to bring across — every
 * answer except "First time user". Decides whether finishing the survey lands
 * on the Migration Center.
 */
export function joinFromNeedsMigration(
  value: string | null | undefined,
): boolean {
  return Boolean(value?.trim()) && migrationRouteForJoinFrom(value!) !== "none";
}
