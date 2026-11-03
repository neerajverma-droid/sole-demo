/**
 * Connect to external accountants via Sole SPM — a secret key this business
 * generates and hands to its accountant's Sole SPM portal, which exchanges it
 * for direct, revocable access to this account. sole-ocr's `/v2/spm/*`
 * resource (the owner-side half; `/validate`, `/connect`, `/disconnect` are
 * server-to-server APIs SPM itself calls and have no UI here).
 *
 * Mirrors sole-webapp's `components/Settings/AccountAccess/SpmConnect.js`.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

export type SpmKeyStatus = "active" | "revoked";
export type SpmConnectionStatus = "active" | "revoked";

export type SpmKey = {
  id: number;
  name: string;
  /** Masked for display — the raw key is only ever returned once, at generation. */
  keyMasked: string;
  status: SpmKeyStatus;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

export type SpmConnection = {
  id: number;
  keyId: number;
  spmName: string | null;
  spmEmail: string | null;
  status: SpmConnectionStatus;
  ipAddress: string | null;
  connectedAt: string | null;
  lastAccessAt: string | null;
};

export type SpmKeysAndConnections = {
  keys: SpmKey[];
  connections: SpmConnection[];
};

/** Returned once by `generateSpmKey` — never shown again after this. */
export type SpmGeneratedKey = {
  id: number;
  name: string;
  secretKey: string;
  keyPrefix: string;
  expiresAt: string | null;
};

type ApiSpmKey = {
  id: number;
  name: string;
  key_masked: string;
  status: SpmKeyStatus;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type ApiSpmConnection = {
  id: number;
  key_id: number;
  spm_name: string | null;
  spm_email: string | null;
  status: SpmConnectionStatus;
  ip_address: string | null;
  connected_at: string | null;
  last_access_at: string | null;
};

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

export async function fetchSpmKeys(): Promise<SpmKeysAndConnections> {
  const { data } = await api.get<
    ApiEnvelope<{ keys: ApiSpmKey[]; connections: ApiSpmConnection[] }>
  >(apiRoutes.spm.listKeys);
  if (!data.success) {
    throw new Error(data.message || "Couldn't load your SPM connections.");
  }
  return {
    keys: (data.data?.keys || []).map((k) => ({
      id: k.id,
      name: k.name,
      keyMasked: k.key_masked,
      status: k.status,
      lastUsedAt: k.last_used_at,
      expiresAt: k.expires_at,
      createdAt: k.created_at,
    })),
    connections: (data.data?.connections || []).map((c) => ({
      id: c.id,
      keyId: c.key_id,
      spmName: c.spm_name,
      spmEmail: c.spm_email,
      status: c.status,
      ipAddress: c.ip_address,
      connectedAt: c.connected_at,
      lastAccessAt: c.last_access_at,
    })),
  };
}

export async function generateSpmKey(): Promise<SpmGeneratedKey> {
  const { data } = await api.post<
    ApiEnvelope<{
      id: number;
      name: string;
      secret_key: string;
      key_prefix: string;
      expires_at: string | null;
    }>
  >(apiRoutes.spm.generateKey, { name: "Sole SPM Connection" });
  if (!data.success || !data.data) {
    throw new Error(data.message || "Couldn't generate a key.");
  }
  return {
    id: data.data.id,
    name: data.data.name,
    secretKey: data.data.secret_key,
    keyPrefix: data.data.key_prefix,
    expiresAt: data.data.expires_at,
  };
}

async function revoke(url: string, id: number): Promise<void> {
  const { data } = await api.post<ApiEnvelope<unknown>>(url, { id });
  if (!data.success) {
    throw new Error(data.message || "Something went wrong.");
  }
}

export function revokeSpmKey(id: number): Promise<void> {
  return revoke(apiRoutes.spm.revokeKey, id);
}

export function revokeSpmConnection(id: number): Promise<void> {
  return revoke(apiRoutes.spm.revokeConnection, id);
}
