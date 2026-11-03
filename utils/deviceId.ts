/**
 * deviceId — this browser's device identity, registered once with the backend.
 *
 * Every auth-mutating call is device-bound, so a device_id is minted via
 * POST /v1/device/register the first time this browser makes one, then reused
 * from a cookie on every call after.
 */
import api from "./axiosInstance";
import apiRoutes from "@/config/api-routes";

const DEVICE_ID_COOKIE = "deviceId";
const COOKIE_DAYS = 30;

const getCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
};

const setCookie = (name: string, value: string, days = COOKIE_DAYS): void => {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export const getDeviceId = (): string | null => getCookie(DEVICE_ID_COOKIE);

/** Dropped on logout, matching the reference app clearing every cookie there. */
export const clearDeviceId = (): void => {
  if (typeof document === "undefined") return;
  document.cookie = `${DEVICE_ID_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

type RegisterDeviceResponse = {
  success: boolean;
  data?: { device_id: string };
};

const registerDevice = async (): Promise<string | null> => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const response = await api.post<RegisterDeviceResponse>(apiRoutes.auth.register, {
    device_uid: "_" + Math.random().toString(36).slice(2, 11),
    platform: "WEBP",
    device_name: ua.split(" ")[0] || "Browser",
    device_os: typeof navigator !== "undefined" ? navigator.platform || "Web" : "Server",
    app_version: 1,
  });

  const deviceId = response.data?.data?.device_id;
  if (response.data?.success && deviceId) {
    setCookie(DEVICE_ID_COOKIE, deviceId);
    return deviceId;
  }
  return null;
};

/** Every auth-mutating call needs one of these — mints one the first time it's missing. */
export const ensureDeviceId = async (): Promise<string | null> => {
  const existing = getDeviceId();
  if (existing) return existing;
  try {
    return await registerDevice();
  } catch {
    // A missing device_id doesn't block the call it's attached to — the
    // backend treats it as optional metadata, not a required credential.
    return null;
  }
};
