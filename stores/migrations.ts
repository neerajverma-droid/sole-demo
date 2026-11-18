import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { MigrationStepId } from "@/lib/migrations";

/**
 * How much each migration step has brought in.
 *
 * Counts rather than booleans, because "done" is not the useful fact here —
 * "142 imported" is. It tells someone at a glance whether the step did what
 * they expected, which a tick can't: an import that silently landed three rows
 * of a three-hundred-row file looks identical to a successful one under a
 * checkbox.
 *
 * Cumulative. Importing a second CSV into the same step adds to the total
 * rather than replacing it, because that's what actually happened — a step is
 * a job someone can come back to, not a single event.
 *
 * Persisted, and it has to be: the flows this counts live on other routes and
 * in other modals, so the page recording the total is unmounted at the moment
 * the total changes. A count held in memory would be a count reset by the
 * navigation that earned it.
 */
type MigrationsState = {
  /** Step id to items imported so far. Absent means never run. */
  imported: Partial<Record<MigrationStepId, number>>;

  /**
   * Records a completed import.
   *
   * Called by the flows themselves, which is what makes a step go green —
   * nothing here infers completion from the presence of data elsewhere,
   * because seeded contacts and a real import look the same from outside.
   *
   * A zero or negative count is ignored rather than stored: an import that
   * brought nothing in did not complete the step, and writing 0 would tick it
   * green with "0 imported" underneath.
   */
  recordImport: (step: MigrationStepId, count: number) => void;

  /** Clears one step's total, for a migration someone wants to redo cleanly. */
  clearImport: (step: MigrationStepId) => void;
};

/**
 * Applies the stored counts before a write, if nothing has yet.
 *
 * Rehydration is deferred (see `skipHydration` below), and only the migration
 * page itself asks for it — but the flows that *record* an import live on
 * other routes, where the in-memory state is still the empty initial one. A
 * write from there would persist `{contacts: 12}` over a stored
 * `{transactions: 340}` and quietly un-tick a finished step.
 *
 * `localStorage` is synchronous, so by the time `rehydrate()` returns the
 * state has already been merged and the write below adds to the real total.
 */
function applyStoredCounts(): void {
  const persist = useMigrationsStore.persist;
  if (!persist || persist.hasHydrated()) return;
  void persist.rehydrate();
}

export const useMigrationsStore = create<MigrationsState>()(
  persist(
    (set) => ({
      imported: {},

      recordImport: (step, count) => {
        if (!Number.isFinite(count) || count <= 0) return;
        applyStoredCounts();

        set((state) => ({
          imported: {
            ...state.imported,
            [step]: (state.imported[step] ?? 0) + count,
          },
        }));
      },

      clearImport: (step) => {
        applyStoredCounts();
        return set((state) => {
          const next = { ...state.imported };
          delete next[step];
          return { imported: next };
        });
      },
    }),
    {
      name: "sole-migrations",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated after mount, like every other persisted store here, so the
      // server and the first client render agree on an empty set.
      skipHydration: true,
    },
  ),
);
