import axios from "axios";

/**
 * The backend's own message, when there is one — a generic "couldn't save
 * that" toast is worse than useless once something like a misconfigured
 * route ("Route not found: DELETE /api/1/9337") is the actual reason, since
 * it hides exactly the detail worth seeing. Falls back to a plain-language
 * default only for errors that never made it to a response at all (network
 * failure, timeout), where there's no server message to show instead.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  } else if (error instanceof Error && error.message) {
    // Errors we throw ourselves from API wrappers (e.g. a `success: false`
    // body on a 200) already carry the server's message.
    return error.message;
  }
  return fallback;
}
