import { create } from "zustand";

/**
 * Whether Quick Actions is showing sample rows for its guided tour.
 *
 * Memory only, on purpose: nothing here is persisted or sent anywhere, so a
 * reload, a route change or the tour ending is all it takes for the samples to
 * be gone. There is nothing to clean up on the server because nothing is ever
 * written to it.
 */
type TourDemoState = {
  /** The tour is running, so empty cards may fill with samples. */
  active: boolean;
  /** Which sections are drawing samples right now — drives the banner. */
  sampled: Record<string, boolean>;
  setActive: (active: boolean) => void;
  setSampled: (section: string, sampled: boolean) => void;
  reset: () => void;
};

export const useTourDemoStore = create<TourDemoState>((set) => ({
  active: false,
  sampled: {},
  setActive: (active) => set((state) => (state.active === active ? state : { active })),
  setSampled: (section, sampled) =>
    set((state) =>
      Boolean(state.sampled[section]) === sampled
        ? state
        : { sampled: { ...state.sampled, [section]: sampled } },
    ),
  reset: () => set({ active: false, sampled: {} }),
}));
