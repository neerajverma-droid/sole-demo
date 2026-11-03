/**
 * Every auth call is device-bound, so make sure this browser has a device row
 * before spending one.
 *
 * Without a device id the backend falls back to a shared default row, and
 * issuing a session against it logs out everyone else sitting on that row — so
 * this runs before sign-in, sign-up and SSO alike.
 */
import { apiPost } from "@/lib/api/client";
import { getDeviceId, setDeviceId } from "@/lib/api/cookies";
import { PLATFORM } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";

function describeBrowser(): { name: string; os: string } {
  if (typeof navigator === "undefined") return { name: "Web", os: "Unknown" };
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /(iPhone|iPad|iPod)/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown";
  return { name, os };
}

export async function registerDevice(): Promise<string | null> {
  const { name, os } = describeBrowser();

  const result = await apiPost<{ device_id?: string }>(
    apiRoutes.auth.registerDevice,
    {
      device_uid: `_${Math.random().toString(36).slice(2, 11)}`,
      platform: PLATFORM,
      device_name: name,
      device_os: os,
      // A string, as the endpoint documents it — the validator runs .trim() on
      // the field, which a number only survives by coercion.
      app_version: "1",
    },
  );

  const id = result.success ? result.data?.device_id : null;
  if (id) setDeviceId(String(id));
  return id ? String(id) : null;
}

let inFlightRegistration: Promise<string | null> | null = null;

/**
 * The id for this browser, registering one on first use.
 *
 * Single-flight, because `device_uid` is freshly random on every call: two
 * concurrent registrations don't race to the same row, they create two of them.
 * The app registers at boot and each auth call asks again, so overlapping
 * callers are the normal case rather than the exceptional one.
 *
 * Returns null only when registration was attempted and failed. Callers treat
 * that as a stop: every credential-spending endpoint rejects a request with no
 * device id, so carrying on would only trade a clear message for the backend's
 * "device_id is required".
 */
export async function ensureDeviceId(): Promise<string | null> {
  const existing = getDeviceId();
  if (existing) return existing;
  if (inFlightRegistration) return inFlightRegistration;

  inFlightRegistration = (async () => {
    try {
      return await registerDevice();
    } finally {
      // Cleared either way: a failure should be retried by the next caller
      // rather than remembered.
      inFlightRegistration = null;
    }
  })();

  return inFlightRegistration;
}
