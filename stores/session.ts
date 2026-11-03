import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The logged-in user's profile, as the backend last returned it.
 *
 * Written by exactly one thing: `SessionProvider`, which is what proves the
 * token against /auth/profile and so is the only part of the app that knows
 * who is signed in. Read by everything that needs the user outside React —
 * the Nexxtap client's `x-user-id`, the bank-connection hand-off, the
 * query-cache scope.
 *
 * Worth saying plainly, because it was broken this way for a while: `setUser`
 * had no caller at all. The store was declared, persisted, rehydrated, read in
 * eight places and never once written, so `user` was permanently null and
 * every reader silently degraded — Nexxtap authenticated as nobody and the
 * query cache was never scoped to a user. If you are adding a second writer,
 * don't: change what `SessionProvider` mirrors instead.
 *
 * Session tokens themselves live in cookies (`lib/api/session.ts`), not here —
 * this is everything else about the user (name, business flags, subscription,
 * has_password, …) that other screens read without refetching.
 */
export type SessionUser = Record<string, unknown> & {
  /**
   * What the backend actually returns. `buildUserProfile` in sole-ocr's
   * auth.service.js emits `user_id`; there is no `id` on the profile response.
   */
  user_id?: string | number;
  /**
   * Declared because several call sites historically reached for it, and
   * because every field here being optional means reading the absent one
   * type-checks cleanly and fails only at runtime. Prefer `sessionUserId()`
   * below to reading either directly.
   */
  id?: string | number;
  email?: string;
  name?: string;
};

type SessionState = {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: "sole-session",
      // Rehydrated manually after mount so server and first client render match.
      skipHydration: true,
    },
  ),
);

/**
 * The signed-in user's id, however the profile happens to spell it.
 *
 * One function rather than `user?.id ?? user?.user_id` written out at each
 * call site — which is how the invoice editor ended up reading only `id` (a
 * field that never arrives, so it resolved null on every render) and the
 * admin-access query ended up keyed on `user?.id ?? null`, giving two
 * different admins on the same browser a single shared cache entry.
 *
 * `user_id` is tried first because it's the one the backend sends.
 */
export function sessionUserId(
  user: SessionUser | null | undefined,
): string | null {
  const raw = user?.user_id ?? user?.id;
  return raw == null || raw === "" ? null : String(raw);
}

/** The same id, read imperatively — for callers outside React. */
export function currentUserId(): string | null {
  return sessionUserId(useSessionStore.getState().user);
}
