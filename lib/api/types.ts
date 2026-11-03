/** The user object every auth response carries, as far as this app reads it. */
export type AuthUser = {
  /**
   * The backend returns `user_id`; `id` is not part of the profile response.
   * Both are declared because every field here is optional, so reading the
   * absent one type-checks and fails only at runtime.
   */
  user_id?: number | string;
  id?: number | string;
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  role?: string;
  isAccountant?: boolean;
  isSuperAdmin?: boolean;
  plan?: string;
  /**
   * Whether this account can sign in with a password at all. It has to come
   * from the profile: the backend's error for "no password set" is
   * indistinguishable from a wrong one.
   */
  has_password?: boolean;
  trial_active?: boolean;
  /** 0/1 from the backend — whether this address has confirmed itself yet. */
  account_verified?: number | boolean | null;
  /**
   * What they said they were using before Sole (`users.join_from`), and the
   * industry on file (`users.industry_id`, 0 when never asked).
   *
   * Both are answers the onboarding survey asks for, and both are held by the
   * server — which is the only copy that survives a sign-out, since the
   * teardown wipes every local store. Read them here rather than trusting the
   * device, or the survey asks a settled account its questions again on every
   * fresh login.
   */
  join_from?: string | null;
  industry_id?: number | string | null;
  /** Signed up but never finished — onboarding is still owed. */
  is_first_login?: boolean;
  is_onboarding_skipped?: boolean | number;
  /**
   * Per-business state from the backend's `business_config` table, keyed by
   * business id. `popups` names the one-time popups already seen in that
   * business — server-side because the sign-out teardown wipes everything
   * local, which is what brought the onboarding survey back at every login.
   */
  business_config?: Record<
    string,
    { popups?: Record<string, boolean | number> }
  >;
  /**
   * A demo visitor (lib/demo.ts). Set on the demo login response and on every
   * profile fetch during the visit, so a reloaded tab still knows. The visit
   * ends at `demo_expires_at` (ISO), or after `demo_idle_minutes` of silence,
   * whichever comes first — and everything done in it is wiped.
   */
  is_demo?: boolean;
  demo_expires_at?: string | null;
  demo_idle_minutes?: number;
  token?: string;
  refresh_token?: string;
};
