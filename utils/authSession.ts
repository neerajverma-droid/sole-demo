export {
  clearSession,
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshAccessToken,
  setSession,
} from "@/lib/api/session";

import { getAccessToken } from "@/lib/api/session";

export const getUserIdFromToken = (): string | number => {
  const token = getAccessToken();
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.user_id ?? payload?.sub ?? "";
  } catch {
    return "";
  }
};
