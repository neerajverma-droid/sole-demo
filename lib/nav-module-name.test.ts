import { describe, expect, it } from "vitest";

import { moduleNameForPath } from "@/lib/nav";

describe("moduleNameForPath — where a contact was started from", () => {
  it("names a module by its list page, not a shortcut into it", () => {
    expect(moduleNameForPath("/invoices/new")).toBe("Invoices");
    expect(moduleNameForPath("/quotes/12/edit")).toBe("Quotes");
    expect(moduleNameForPath("/contacts")).toBe("Contacts");
    expect(moduleNameForPath("/expenses?tab=bills")).toBe("Expenses");
  });

  it("title-cases a path the nav doesn't know, and is null at the root", () => {
    expect(moduleNameForPath("/some-new-page/3")).toBe("Some New Page");
    expect(moduleNameForPath("/")).toBeNull();
    expect(moduleNameForPath(null)).toBeNull();
  });
});
