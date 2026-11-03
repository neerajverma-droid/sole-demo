/**
 * Account Sharing — inviting an accountant, bookkeeper or other helper into
 * this business's books with a scoped, expiring, revocable set of
 * permissions. sole-ocr's `/v2/accountants/*` resource (`AccountantAccess`),
 * shared with the Sole Support "grant us access" button on the same screen.
 *
 * Mirrors sole-webapp's `components/Settings/AccountAccess/AccountantAccess.js`
 * and `AccountantPermission.js`.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { apiErrorMessage } from "@/lib/api-error";

export type PermissionAction = "view" | "add" | "edit" | "delete";

/** One row of the permission matrix — a module and the actions it can grant. */
export type PermissionModule = {
  name: string;
  title: string;
  /** Shown as a warning tooltip only for modules with a wider blast radius (Reporting Suite). */
  tooltip?: string;
  actions: PermissionAction[];
};

/** Keyed by `PermissionModule.name`; absent or empty means no access to that module. */
export type AccountantPermissions = Record<string, PermissionAction[]>;

export type AccountantInviteStatus =
  | "Pending"
  | "Connected"
  | "Rejected"
  | "Expired";

export const ACCOUNTANT_ROLES = [
  { value: "A", label: "Accountant" },
  { value: "B", label: "Bookkeeper" },
  { value: "F", label: "Financial Expert" },
  { value: "P", label: "Partners" },
  { value: "O", label: "Other / Secondary Log In" },
] as const;

export type AccountantRole = (typeof ACCOUNTANT_ROLES)[number]["value"];

export type AccountantInvite = {
  id: number;
  name: string;
  email: string;
  ccType: string;
  permissions: AccountantPermissions;
  /** Display-formatted (d/m/Y), set once the invite is accepted. */
  startDate: string;
  /** Display-formatted (d/m/Y); "" means no expiry. */
  endDate: string;
  /** Y-m-d, for prefilling the edit form's date picker. */
  endDateIso: string;
  status: AccountantInviteStatus;
};

export type AccountantAccessList = {
  invites: AccountantInvite[];
  permissionModules: PermissionModule[];
};

type ApiPermissionModule = {
  name: string;
  title: string;
  tooltip?: string;
  actions: PermissionAction[];
};

type ApiAccountantInvite = {
  id: number;
  name: string;
  email: string;
  cc_type?: string | null;
  permissions: AccountantPermissions;
  accepted_at?: string;
  expired_at?: string;
  expired_at_main?: string;
  status: AccountantInviteStatus;
};

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

function mapInvite(row: ApiAccountantInvite): AccountantInvite {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ccType: row.cc_type || "",
    permissions: row.permissions || {},
    startDate: row.accepted_at || "",
    endDate: row.expired_at || "",
    endDateIso: row.expired_at_main || "",
    status: row.status,
  };
}

export async function fetchAccountantAccess(): Promise<AccountantAccessList> {
  const { data } = await api.get<
    ApiEnvelope<{ invites: ApiAccountantInvite[]; permissions: ApiPermissionModule[] }>
  >(apiRoutes.accountants.list);
  if (!data.success) {
    throw new Error(data.message || "Couldn't load shared access.");
  }
  return {
    invites: (data.data?.invites || []).map(mapInvite),
    permissionModules: data.data?.permissions || [],
  };
}

export type AccountantInvitePayload = {
  name: string;
  email: string;
  ccType: string;
  /** Y-m-d, or "" for no expiry. */
  endDateIso: string;
  permissions: AccountantPermissions;
};

async function postForInvites(
  url: string,
  body: Record<string, unknown>,
): Promise<AccountantInvite[]> {
  const { data } = await api.post<ApiEnvelope<{ invites?: ApiAccountantInvite[] }>>(
    url,
    body,
  );
  if (!data.success) {
    throw new Error(data.message || "Something went wrong.");
  }
  return (data.data?.invites || []).map(mapInvite);
}

export function sendAccountantInvite(
  payload: AccountantInvitePayload,
): Promise<AccountantInvite[]> {
  return postForInvites(apiRoutes.accountants.sendInvite, {
    name: payload.name,
    email: payload.email,
    cc_type: payload.ccType,
    expired_at: payload.endDateIso,
    permissions: payload.permissions,
  });
}

export function updateAccountantInvite(
  id: number,
  payload: Omit<AccountantInvitePayload, "ccType">,
): Promise<AccountantInvite[]> {
  return postForInvites(apiRoutes.accountants.updateAccount, {
    id,
    name: payload.name,
    email: payload.email,
    expired_at: payload.endDateIso,
    permissions: payload.permissions,
  });
}

export async function deleteAccountantInvite(id: number): Promise<void> {
  const { data } = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.accountants.delete,
    { id },
  );
  if (!data.success) {
    throw new Error(data.message || "Couldn't remove that access.");
  }
}

export function addSupportAccess(): Promise<AccountantInvite[]> {
  return postForInvites(apiRoutes.accountants.supportAccess, {});
}

export function accountantStatusVariant(
  status: AccountantInviteStatus,
): "success" | "warning" | "danger" | "secondary" {
  if (status === "Connected") return "success";
  if (status === "Pending") return "warning";
  if (status === "Rejected") return "danger";
  return "secondary";
}

/** The most specific message available, same rule as the other settings sections. */
export function accountantAccessErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return apiErrorMessage(error, fallback);
}

/**
 * Every module checked for every action it offers — the "grant everything to
 * a trusted partner" shortcut. Toggling: if everything is already granted,
 * clear it instead.
 */
export function isFullAccess(
  modules: PermissionModule[],
  permissions: AccountantPermissions,
): boolean {
  return modules.every((module) =>
    module.actions.every((action) =>
      (permissions[module.name] || []).includes(action),
    ),
  );
}

export function fullAccessPermissions(
  modules: PermissionModule[],
): AccountantPermissions {
  return Object.fromEntries(modules.map((module) => [module.name, [...module.actions]]));
}

/**
 * Toggle one checkbox in the matrix, with the backup's two house rules:
 * turning on add/edit/delete implies view, turning on Reporting Suite's view
 * implies view everywhere else (it already exposes the data), and view can't
 * be turned off while a stronger action on the same module still needs it.
 */
export function updatePermission(
  permissions: AccountantPermissions,
  modules: PermissionModule[],
  moduleName: string,
  action: PermissionAction,
  checked: boolean,
): AccountantPermissions {
  const current = permissions[moduleName] || [];
  const next = { ...permissions };

  if (checked) {
    const actions = new Set(current);
    if (action !== "view" && (action === "add" || action === "edit" || action === "delete")) {
      actions.add("view");
    }
    actions.add(action);
    next[moduleName] = [...actions];

    if (moduleName === "report" && action === "view") {
      for (const otherModule of modules) {
        if (otherModule.name === "report") continue;
        const existing = new Set(next[otherModule.name] || []);
        existing.add("view");
        next[otherModule.name] = [...existing];
      }
    }
    return next;
  }

  if (
    action === "view" &&
    (current.includes("add") || current.includes("edit") || current.includes("delete"))
  ) {
    return permissions;
  }

  next[moduleName] = current.filter((a) => a !== action);
  return next;
}
