/**
 * Deleting the signed-in account itself — distinct from `lib/subscription.ts`
 * because it isn't a billing action: a free-plan account can delete itself
 * too.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/**
 * Soft-deletes the account: every business subscription is cancelled, every
 * business is soft-deleted, every session is invalidated, and the Clerk
 * identity is unlinked — see sole-ocr's `deleteAccount` service for the full
 * list. Irreversible from here; only support can undo it.
 *
 * The reason is saved and awaited (unlike `cancelSubscription`'s
 * fire-and-forget post to the same endpoint) because the delete call reads
 * back the latest `delete_account` feedback row to tell the retention team
 * why — it has to already be committed by the time that call goes out. A
 * failed save still isn't a reason to keep the account, so it's swallowed
 * rather than blocking the delete that follows.
 */
export async function deleteAccount(
  reason: string,
  otherText = "",
): Promise<string | undefined> {
  try {
    await api.post(
      apiRoutes.subscription.cancelFeedback,
      buildEncryptedRequestBody({
        reason,
        other_text: otherText,
        type: "delete_account",
      }),
    );
  } catch {
    // See the note above — losing the survey answer doesn't block deletion.
  }

  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.user.deleteAccount,
    buildEncryptedRequestBody({}),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete your account.");
  }

  /*
   * Same redaction rule as `cancelSubscription`: the predefined reason only,
   * never `otherText` — that's free text someone typed and may contain
   * account details, names or complaints that can't be redacted once in a
   * third-party tool.
   */
  track(EVENTS.ACCOUNT_DELETED, {
    reason,
    has_other_text: otherText.trim().length > 0,
  });

  return response.data.message;
}
