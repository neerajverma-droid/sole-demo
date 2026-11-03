import { describe, expect, it } from "vitest";

import { addonById } from "@/lib/addons";
import { addonRows, isActivePath, searchTargets } from "@/lib/nav";

/*
 * The Projects / Milestones add-on in the rail: a group with Projects and
 * Project Settings under it, reachable from search, and lighting up the right
 * row on each of its routes.
 */

describe("the Projects add-on", () => {
  const addon = addonById("projects");

  it("goes to /projects and lists its two pages", () => {
    expect(addon?.href).toBe("/projects");
    expect(addon?.pages?.map((page) => [page.label, page.href])).toEqual([
      ["Projects", "/projects"],
      ["Project Settings", "/projects/settings"],
    ]);
  });

  it("draws as a group in the Add-ons section once added, opening its pages rather than navigating", () => {
    const [row] = addonRows(["projects"]);
    expect(row).toMatchObject({ id: "projects", label: "Projects / milestones" });
    expect(row.href).toBeUndefined();
    expect(row.children?.map((child) => child.href)).toEqual(["/projects", "/projects/settings"]);
  });

  it("is findable from the command palette by its page names", () => {
    const targets = searchTargets().filter((target) => target.parent === "Projects / milestones");
    expect(targets.map((target) => [target.label, target.href])).toEqual([
      ["Projects", "/projects"],
      ["Project Settings", "/projects/settings"],
    ]);
  });
});

describe("which Projects row is active", () => {
  it("lights Projects on the list and on a project's own page", () => {
    expect(isActivePath("/projects", "/projects")).toBe(true);
    expect(isActivePath("/projects/77", "/projects")).toBe(true);
  });

  it("lights only Project Settings on the settings page, not Projects as well", () => {
    expect(isActivePath("/projects/settings", "/projects/settings")).toBe(true);
    expect(isActivePath("/projects/settings", "/projects")).toBe(false);
  });

  it("leaves the other add-ons' pages alone", () => {
    expect(isActivePath("/calendar", "/projects")).toBe(false);
    expect(isActivePath("/planner", "/planner")).toBe(true);
  });
});
