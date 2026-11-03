import apiRoutes from "@/config/api-routes";
import { REFERRAL_SOURCE_OTHER } from "@/lib/onboarding-survey/referral-sources";

/**
 * Which request each of Pip's survey answers dispatches, as data rather than
 * as a side effect.
 *
 * `components/onboarding/survey/onboarding-survey-popup.tsx` saves every
 * answer fire-and-forget the moment it's given (see that file's doc for why),
 * which makes "what does answering X actually send" hard to unit-test end to
 * end without a full DOM and a mocked router/store on top of the API mock.
 * Pulling the request-shape decision out into these pure functions means the
 * mapping from answer to request can be checked directly — no network, no
 * component, no store — while the popup itself stays a thin
 * `api[request.method](request.url, request.body)` at each call site.
 *
 * Bodies are plain JSON, not the encrypted `{ data: <ciphertext> }` shape
 * `lib/encrypted-request.ts` builds for some `user`-namespace writes, and not
 * source's raw multipart FormData (a Pages-Router idiom with no equivalent
 * need here). `update_business_profile` accepts either a plain or an
 * encrypted body, so the industry save works as plain JSON.
 */
export type SaveRequest = {
  method: "post" | "put";
  url: string;
  body: Record<string, unknown>;
};

/** `users.join_from` — saved through the same endpoint as any other profile field. */
export function joinFromSaveRequest(label: string): SaveRequest {
  return {
    method: "post",
    url: apiRoutes.user.addAccInfo,
    body: { join_from: label },
  };
}

/**
 * The business's industry.
 *
 * `industry_id`, not `{ industry: "<name>" }`. That is what this sent before,
 * and `updateBusinessProfile` (sole-ocr/src/services/users.js) reads only
 * `industry_id` — every key it doesn't recognise is dropped, so the industry
 * was silently discarded on every save this ever made. The same bug was in
 * `CompanyProfileStep`.
 *
 * Takes an id because only the live `/industry` list can supply one; a name
 * typed into the "my industry isn't listed" box has none, and the caller
 * decides what to do about that rather than this quietly posting a field the
 * server ignores.
 */
export function industrySaveRequest(industryId: number): SaveRequest {
  return {
    // POST — sole-ocr registers `/user/update_business_profile` as POST only.
    method: "post",
    url: apiRoutes.user.updateUserProfile,
    body: { industry_id: industryId },
  };
}

/**
 * `users.referral_source`. `other_text` is only sent alongside the "Other"
 * option — omitted (not blank) for every named source, so the server doesn't
 * see a free-text field it never asked for.
 */
export function referralSaveRequest(
  source: string,
  otherText: string,
): SaveRequest {
  return {
    method: "post",
    url: apiRoutes.user.referralSource,
    body: {
      source,
      ...(source === REFERRAL_SOURCE_OTHER
        ? { other_text: otherText.trim() }
        : {}),
    },
  };
}

/** The chosen starter set of sidebar shortcuts. */
export function sidebarPinsSaveRequest(ids: string[]): SaveRequest {
  return {
    method: "post",
    url: apiRoutes.userConfig.sidebarPins,
    body: { pinnedNavIds: ids },
  };
}
