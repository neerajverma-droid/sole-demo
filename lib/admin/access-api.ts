import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import { NO_ADMIN_ACCESS, type AdminAccess } from "@/lib/admin/access";

type ApiMyAccessResponse = {
  success?: boolean;
  data?: { isSuperAdmin?: boolean | number; features?: unknown };
};

/**
 * `GET /super/my-access` — which admin sections this account can open.
 *
 * Any signed-in account can ask; one that isn't an admin gets an empty list.
 * A super admin's list already holds every key, but `isSuperAdmin` is still
 * what `canPass` checks first, so a key the backend adds later doesn't need a
 * release here before super admins can see it.
 */
export async function fetchAdminAccess(): Promise<AdminAccess> {
  const response = await api.get<ApiMyAccessResponse>(apiRoutes.superAdmin.myAccess);
  const data = response.data?.data;
  if (!data) return NO_ADMIN_ACCESS;

  return {
    isSuperAdmin: data.isSuperAdmin === true || data.isSuperAdmin === 1,
    features: Array.isArray(data.features)
      ? data.features.filter((key): key is string => typeof key === "string")
      : [],
  };
}
