/**
 * The real "Connect your bank" flow — sole-ocr's `/bank/connect` resource,
 * which proxies to the open-banking provider for the business's country:
 *
 *   - Fiskil (Australia), an accredited Consumer Data Right (CDR) provider.
 *     Its hosted flow (the `authUrl` returned here) handles bank search and
 *     consent itself, inside a fullscreen iframe of ours.
 *   - Akahu (New Zealand). Its consent hands off to the bank's own login,
 *     which won't load in a frame, so the whole page goes to Akahu and comes
 *     back to `/akahu-callback`, which finishes the connection with
 *     `completeAkahuConnection`.
 *
 * Either way there's no bank picker or consent screen of our own to build.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import type { BankFeedProvider } from "@/lib/country-context";
import { currentUserId, useSessionStore } from "@/stores/session";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/**
 * Starts a connection and returns the provider's hosted-flow URL.
 *
 * Fiskil's endpoint takes no auth token — it reads `userId`/`email`/`name` as
 * plain query params instead (see `sole-ocr/src/routes/addBank.js`, which
 * mounts it with no `verifyUser` middleware). Akahu's is authenticated and
 * takes the user and business from the session; only `email` is sent, to
 * prefill Akahu's sign-in.
 */
export async function startBankConnection(
  provider: BankFeedProvider = "fiskil",
): Promise<string> {
  const user = useSessionStore.getState().user;
  // `currentUserId` handles which of `user_id`/`id` the profile actually
  // carries — sole-webapp's equivalent call reads `user_id` and `full_name`,
  // not `id`/`name`.
  const userId = currentUserId() ?? undefined;
  const email = typeof user?.email === "string" ? user.email : undefined;
  const name =
    typeof user?.full_name === "string" ? user.full_name : undefined;

  if (!userId) {
    throw new Error("Sign in again before connecting a bank account.");
  }

  const response =
    provider === "akahu"
      ? await api.post<ApiEnvelope<{ authUrl?: string }>>(
          apiRoutes.bankConnection.akahu.connect,
          { email },
        )
      : await api.get<ApiEnvelope<{ authUrl?: string }>>(
          apiRoutes.bankConnection.connect,
          { params: { userId, email, name } },
        );

  const authUrl = response.data?.data?.authUrl;
  if (!authUrl || !authUrl.startsWith("https://")) {
    throw new Error("Couldn't start the bank connection. Try again.");
  }

  /*
   * Named `bank_account_connected` but fired when the hand-off starts, which
   * is a deliberate compromise and worth being honest about: the connection
   * itself completes on the provider's own site, and this app never sees that
   * moment. The honest alternative — no event at all — would leave the single
   * most important activation step in the product unmeasured.
   *
   * So read this as "reached the bank's screen". Whether they came back is
   * answerable from whether any transaction ever arrived for them.
   */
  track(EVENTS.BANK_ACCOUNT_CONNECTED, { stage: "handoff_started", provider });

  return authUrl;
}

export type AkahuCallbackResult = "connected" | "cancelled";

/**
 * Finishes an Akahu connection with what Akahu put on the redirect back to
 * `/akahu-callback`. The code is single-use and expires within a minute, so
 * this is called once, straight away. Posting the same redirect again (a
 * reload) is safe: the server answers that it's already connected.
 */
export async function completeAkahuConnection(params: {
  code: string | null;
  state: string | null;
  error: string | null;
}): Promise<AkahuCallbackResult> {
  if (!params.state) {
    throw new Error("This link is missing details from Akahu. Start the connection again.");
  }

  const response = await api.post<
    ApiEnvelope<{ cancelled?: boolean; alreadyConnected?: boolean }>
  >(apiRoutes.bankConnection.akahu.callback, {
    code: params.code ?? undefined,
    state: params.state,
    error: params.error ?? undefined,
  });

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't finish connecting your bank.");
  }
  return response.data?.data?.cancelled ? "cancelled" : "connected";
}
