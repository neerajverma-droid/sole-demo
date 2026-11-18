import { describe, expect, it } from "vitest";

import {
  addonContentErrors,
  contentToForm,
  formToContent,
} from "@/lib/admin/addon-content";

describe("the add-on content form", () => {
  it("opens a row with no content as blanks, in Finance, for every industry", () => {
    const form = contentToForm(null);
    expect(form.category).toBe("finance");
    expect(form.industries).toEqual([]);
    expect(form.benefits).toEqual(["", "", ""]);
    expect(form.included).toBe("");
  });

  it("round-trips stored content through the form unchanged", () => {
    const stored = {
      category: "operations" as const,
      industries: [4, 9],
      subtext: "A calendar tied to your jobs",
      video_title: "scheduling",
      video_url: "https://youtu.be/abc",
      overview: "Overview",
      what_it_does: "Does",
      why_it_helps: "Helps",
      how_it_works: "Works",
      benefits: ["a", "b", "c"],
      included: ["x", "y"],
    };
    const form = contentToForm(stored);
    expect(form.industries).toEqual(["4", "9"]);
    expect(form.included).toBe("x\ny");
    expect(formToContent(form)).toEqual(stored);
  });

  it("sends blanks as blanks, a missing video as null, and empty benefits as none", () => {
    const content = formToContent({ ...contentToForm(null), included: "  one \n\n two  " });
    expect(content.video_url).toBeNull();
    expect(content.benefits).toEqual([]);
    expect(content.included).toEqual(["one", "two"]);
  });

  it("flags a video link that isn't a web link", () => {
    expect(addonContentErrors({ ...contentToForm(null), videoUrl: "javascript:alert(1)" }).videoUrl).toBeTruthy();
    expect(addonContentErrors({ ...contentToForm(null), videoUrl: "youtube.com/x" }).videoUrl).toBeTruthy();
    expect(addonContentErrors({ ...contentToForm(null), videoUrl: "https://youtube.com/x" }).videoUrl).toBeUndefined();
  });

  it("wants all three benefits, or none", () => {
    const form = contentToForm(null);
    expect(addonContentErrors({ ...form, benefits: ["a", "", ""] }).benefits).toBeTruthy();
    expect(addonContentErrors({ ...form, benefits: ["a", "b", "c"] }).benefits).toBeUndefined();
    expect(addonContentErrors(form).benefits).toBeUndefined();
  });
});
