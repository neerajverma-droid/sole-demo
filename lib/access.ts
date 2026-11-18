/**
 * What the signed-in session is allowed to do, from the profile the server
 * already sends back.
 *
 * Two separate gates, both ported from the old app:
 *
 * - **Permissions** — an accountant logged in as a client carries an
 *   `accountant_access` grant naming, per module, the actions they may take
 *   (`view`, `add`, `edit`, `delete`). `null` means no grant governs the session
 *   (the owner, or super-admin impersonation) and everything is allowed. The
 *   server enforces the same grant on every route; this only keeps the screen
 *   from offering a button that is certain to be refused.
 * - **Plan features** — `allowed_features` is computed server-side from the
 *   plan, add-ons, trial and Fitrec, and is the single source of truth.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

export type AccessAction = "view" | "add" | "edit" | "delete";

export type AccessProfile = {
  /** `null` = unrestricted; an object = a real grant, which may name few or no modules. */
  permissions: Record<string, string[] | Record<string, string>> | null;
  /** Whether this is a login-as session — permissions only apply then. */
  isLoginAs: boolean;
  /** `null` when the profile didn't say, which is treated as "not restricted". */
  allowedFeatures: string[] | null;
  /**
   * The free-tier asset allowance, from the profile's `can` block — the same
   * fields the old app's FreeTierAlertDialog and TransactionCounters read.
   * `canAdd` is the server's answer (missing = allowed); the counter is only
   * shown when the server sets `displayLimit`.
   */
  assetLimit: AssetLimit;
};

export type AssetLimit = {
  canAdd: boolean;
  used: number | null;
  max: number | null;
  displayLimit: boolean;
  /** When the monthly allowance resets, as the server words it. */
  resetsOn: string | null;
};

/** What a free account can reach, used when the profile carries no feature list. */
const FREE_FEATURES = [
  "dashboard",
  "sales",
  "expenses",
  "assets",
  "contacts",
  "resources",
  "referral",
  "community",
  "perks",
  "settings",
  "support",
  "education",
  "reporting",
  "migrations",
];

type ApiProfile = {
  permissions?: AccessProfile["permissions"];
  isLoginAs?: boolean;
  allowed_features?: unknown;
  can?: {
    add_asset?: boolean;
    assets?: number | string | null;
    max_assets?: number | string | null;
    display_limit_sec?: boolean;
    limit_reset?: string | null;
  } | null;
};

const countOrNull = (value: unknown): number | null => {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number) ? null : number;
};

export async function fetchAccessProfile(): Promise<AccessProfile> {
  const response = await api.post<{ data?: { user?: ApiProfile } }>(
    apiRoutes.user.getUserProfile,
    buildEncryptedRequestBody({}),
  );
  return mapAccessProfile(response.data?.data?.user);
}

export function mapAccessProfile(user: ApiProfile | undefined): AccessProfile {
  const features = Array.isArray(user?.allowed_features)
    ? user.allowed_features.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  return {
    permissions: user?.permissions ?? null,
    isLoginAs: Boolean(user?.isLoginAs),
    allowedFeatures: features.length > 0 ? features : null,
    assetLimit: {
      canAdd: user?.can?.add_asset !== false,
      used: countOrNull(user?.can?.assets),
      max: countOrNull(user?.can?.max_assets),
      displayLimit: Boolean(user?.can?.display_limit_sec),
      resetsOn: user?.can?.limit_reset || null,
    },
  };
}

/**
 * Whether a login-as session lacks permission for `action` on `module`.
 *
 * Only a login-as session governed by a grant can be blocked; for everyone else
 * this is always false. A module the grant doesn't mention at all is blocked,
 * the same as one that lists other actions.
 */
export function isActionBlocked(
  profile: AccessProfile | undefined,
  module: string,
  action: AccessAction,
): boolean {
  if (!profile || !profile.isLoginAs || !profile.permissions) return false;
  const granted = profile.permissions[module];
  if (granted === undefined) return true;
  const actions = Array.isArray(granted) ? granted : Object.values(granted);
  return !actions.includes(action);
}

/**
 * Whether the plan includes `feature`. Until the profile has loaded — or when it
 * names no features — nothing is withheld on a guess; the server still decides.
 */
export function hasPlanFeature(
  profile: AccessProfile | undefined,
  feature: string,
): boolean {
  if (!profile) return true;
  if (profile.allowedFeatures === null) return FREE_FEATURES.includes(feature);
  return profile.allowedFeatures.includes(feature);
}
