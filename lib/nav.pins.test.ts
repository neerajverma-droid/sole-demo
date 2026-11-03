import { describe, expect, it } from "vitest";

import { isPinnable, orderedNav, pinTargets, visibleNav } from "@/lib/nav";

/**
 * What a pin is allowed to point at.
 *
 * A group row opens the list beneath it and goes nowhere itself, so a shortcut
 * to one saves nobody the step it claims to — and pinning it used to copy the
 * whole collapsible into PINNED, putting a second nested list at the top of the
 * section whose entire job was to be the short one.
 *
 * This is the kind of rule that drifts back: it reads as an arbitrary exception
 * until you remember that "every row is pinnable" was the simpler-sounding one
 * that caused the problem. The stale-pin case is pinned too, because anyone who
 * pinned a group before this existed still has that id in `user_config` and the
 * only thing standing between them and an unremovable row in PINNED — a row
 * whose own pin button is now hidden — is `pinTargets` dropping it.
 */

/** Every row the live nav has, split by whether it opens a submenu. */
const sections = orderedNav({}, {}, []);
const topLevel = sections.flatMap((section) => section.items);
const groups = topLevel.filter((item) => (item.children ?? []).length > 0);
const topLevelLeaves = topLevel.filter(
  (item) => (item.children ?? []).length === 0,
);
const children = topLevel.flatMap((item) => item.children ?? []);

describe("what can be pinned", () => {
  it("has groups, top-level leaves and children to test with", () => {
    // Guards the assertions below from passing vacuously if the nav is
    // restructured — an empty list satisfies every `every()` there is.
    expect(groups.length).toBeGreaterThan(0);
    expect(topLevelLeaves.length).toBeGreaterThan(0);
    expect(children.length).toBeGreaterThan(0);
  });

  it("refuses a group row", () => {
    for (const group of groups) {
      expect(
        isPinnable(group.id),
        `${group.label} should not be pinnable`,
      ).toBe(false);
    }
  });

  it("allows every child of a group", () => {
    for (const child of children) {
      expect(isPinnable(child.id), `${child.label} should be pinnable`).toBe(
        true,
      );
    }
  });

  it("allows a top-level row that has no children", () => {
    // Assets and Migrations: leaves that happen to sit at depth zero. The rule
    // is about having somewhere to go, not about depth.
    for (const leaf of topLevelLeaves) {
      expect(isPinnable(leaf.id), `${leaf.label} should be pinnable`).toBe(
        true,
      );
    }
  });

  it("says no to an id the nav has never heard of", () => {
    expect(isPinnable("not-a-row")).toBe(false);
  });
});

describe("pinTargets", () => {
  it("drops a group id somebody pinned before groups stopped being pinnable", () => {
    const group = groups[0];

    expect(pinTargets([group.id])).toEqual([]);
  });

  it("keeps the rest of a stored list when one entry is a stale group", () => {
    const group = groups[0];
    const child = children[0];

    // The whole list mustn't go down with the one bad id — that would unpin
    // everything for anyone who had ever pinned a group.
    expect(pinTargets([group.id, child.id]).map((item) => item.id)).toEqual([
      child.id,
    ]);
  });

  it("resolves a child, and gives it its parent's icon to line up with", () => {
    const parent = groups.find((item) => (item.children ?? []).length > 0)!;
    const child = parent.children![0];

    const [resolved] = pinTargets([child.id]);

    expect(resolved.id).toBe(child.id);
    expect(resolved.icon).toBe(parent.icon);
  });

  it("keeps the order they were pinned in, not the nav's own", () => {
    const [first, second] = children;

    expect(pinTargets([second.id, first.id]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("brings no submenu into PINNED, since nothing with one gets there", () => {
    const everyId = [...topLevel, ...children].map((item) => item.id);
    const resolved = pinTargets(everyId);

    expect(resolved.every((item) => !(item.children ?? []).length)).toBe(true);
  });
});

/**
 * A pin is a move, not a copy.
 *
 * The row goes up to PINNED and leaves the section it came from. The case that
 * needs pinning down hardest is the group that empties, because it empties for
 * two opposite reasons that look identical on screen: every child switched off
 * (keep the inert row — a preference was expressed about the children, not the
 * parent) and every child pinned (drop it — nothing was switched off, the
 * contents just moved upstairs, and a chevron onto nothing reads as broken).
 */
describe("visibleNav — pinning moves a row out of its section", () => {
  const ids = (sections: ReturnType<typeof visibleNav>) =>
    sections.flatMap((section) => section.items.map((item) => item.id));

  const childIds = (sections: ReturnType<typeof visibleNav>, groupId: string) =>
    sections
      .flatMap((section) => section.items)
      .find((item) => item.id === groupId)
      ?.children?.map((child) => child.id);

  const group = groups[0];
  const leaf = topLevelLeaves[0];

  it("drops a pinned top-level leaf from its section", () => {
    expect(ids(visibleNav({}))).toContain(leaf.id);
    expect(ids(visibleNav({ pinned: [leaf.id] }))).not.toContain(leaf.id);
  });

  it("drops a pinned child from its group's submenu", () => {
    const child = group.children![0];

    expect(childIds(visibleNav({}), group.id)).toContain(child.id);
    expect(
      childIds(visibleNav({ pinned: [child.id] }), group.id),
    ).not.toContain(child.id);
  });

  it("leaves the group's other children where they are", () => {
    const [first, ...rest] = group.children!;

    expect(childIds(visibleNav({ pinned: [first.id] }), group.id)).toEqual(
      rest.map((child) => child.id),
    );
  });

  it("drops the group itself once every child is pinned", () => {
    const all = group.children!.map((child) => child.id);

    expect(ids(visibleNav({ pinned: all }))).not.toContain(group.id);
  });

  it("keeps a group whose children were all switched off instead", () => {
    // The inert row: its own switch is still on, so hiding it would answer a
    // question about the children by taking the parent away.
    const all = group.children!.map((child) => child.id);
    const sections = visibleNav({ hidden: all });

    expect(ids(sections)).toContain(group.id);
    expect(childIds(sections, group.id)).toEqual([]);
  });

  it("keeps a group emptied by a mix of pinning and hiding", () => {
    // Something was switched off, and that statement outranks the pins.
    const [first, ...rest] = group.children!;
    const sections = visibleNav({
      pinned: [first.id],
      hidden: rest.map((child) => child.id),
    });

    expect(ids(sections)).toContain(group.id);
    expect(childIds(sections, group.id)).toEqual([]);
  });

  it("brings the group back when one child is unpinned", () => {
    const all = group.children!.map((child) => child.id);
    const [, ...rest] = all;

    expect(ids(visibleNav({ pinned: rest }))).toContain(group.id);
  });

  it("ignores a pinned id that names nothing in the nav", () => {
    expect(ids(visibleNav({ pinned: ["not-a-row"] }))).toEqual(
      ids(visibleNav({})),
    );
  });

  it("treats an absent pinned list as nothing pinned", () => {
    // Storage predates the field: it arrives undefined for anyone who hasn't
    // visited since it was added, and that has to mean "nothing", not a throw.
    expect(ids(visibleNav({}))).toEqual(ids(visibleNav({ pinned: [] })));
  });
});
