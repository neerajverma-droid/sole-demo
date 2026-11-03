import { describe, expect, it } from "vitest";

import apiRoutes from "@/config/api-routes";
import {
  industrySaveRequest,
  joinFromSaveRequest,
  referralSaveRequest,
  sidebarPinsSaveRequest,
} from "@/lib/onboarding-survey/save-requests";
import { REFERRAL_SOURCE_OTHER } from "@/lib/onboarding-survey/referral-sources";

describe("joinFromSaveRequest", () => {
  it("posts the label to the addAccInfo route", () => {
    expect(joinFromSaveRequest("Xero")).toEqual({
      method: "post",
      url: apiRoutes.user.addAccInfo,
      body: { join_from: "Xero" },
    });
  });
});

describe("industrySaveRequest", () => {
  /*
   * `industry_id`, not a name. `updateBusinessProfile` reads only
   * `industry_id` and drops every key it doesn't recognise, so the old
   * `{ industry: "Trades" }` body saved nothing at all — silently, on every
   * call. This test is the guard against that coming back.
   */
  it("posts the industry id to updateUserProfile", () => {
    expect(industrySaveRequest(18)).toEqual({
      method: "post",
      url: apiRoutes.user.updateUserProfile,
      body: { industry_id: 18 },
    });
  });
});

describe("referralSaveRequest", () => {
  it("posts a named source with no other_text field at all", () => {
    const request = referralSaveRequest("Instagram", "");
    expect(request.body).toEqual({ source: "Instagram" });
    expect(request.body).not.toHaveProperty("other_text");
    expect(request.url).toBe(apiRoutes.user.referralSource);
  });

  it("trims and includes other_text for the Other option", () => {
    const request = referralSaveRequest(
      REFERRAL_SOURCE_OTHER,
      "  A mate told me  ",
    );
    expect(request.body).toEqual({
      source: REFERRAL_SOURCE_OTHER,
      other_text: "A mate told me",
    });
  });
});

describe("sidebarPinsSaveRequest", () => {
  it("posts the chosen ids to the sidebar-pins route", () => {
    expect(sidebarPinsSaveRequest(["invoices", "quotes"])).toEqual({
      method: "post",
      url: apiRoutes.userConfig.sidebarPins,
      body: { pinnedNavIds: ["invoices", "quotes"] },
    });
  });

  it("still builds a request for an empty selection", () => {
    expect(sidebarPinsSaveRequest([])).toEqual({
      method: "post",
      url: apiRoutes.userConfig.sidebarPins,
      body: { pinnedNavIds: [] },
    });
  });
});
