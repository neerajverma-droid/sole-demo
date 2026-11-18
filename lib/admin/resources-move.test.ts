import { beforeEach, describe, expect, it, vi } from "vitest";

const patch = vi.fn();
vi.mock("@/utils/axiosInstance", () => ({ default: { patch: (...args: unknown[]) => patch(...args) } }));

import {
  filterFolderOptions,
  flattenFolders,
  moveResourceFiles,
  type AdminResourceFolder,
} from "./resources";

const folder = (id: number, name: string, children: AdminResourceFolder[] = []): AdminResourceFolder => ({
  id,
  parentId: null,
  name,
  slug: name.toLowerCase(),
  description: null,
  sortOrder: 0,
  isPublished: true,
  files: [],
  children,
});

describe("moveResourceFiles", () => {
  // Braces matter: `() => patch.mockReset()` returns the mock, and Vitest runs a function
  // returned from beforeEach as a cleanup, which would call it again after each test.
  beforeEach(() => {
    patch.mockReset();
  });

  it("sends the ids and destination to the bulk endpoint and returns the count moved", async () => {
    patch.mockResolvedValue({ data: { success: true, data: { moved: 3 } } });
    await expect(moveResourceFiles([1, 2, 3], 9)).resolves.toBe(3);
    expect(patch).toHaveBeenCalledWith(expect.stringMatching(/\/super\/resources\/files\/move$/), {
      fileIds: [1, 2, 3],
      folderId: 9,
    });
  });

  it("falls back to the number asked for when the server omits the count", async () => {
    patch.mockResolvedValue({ data: { success: true } });
    await expect(moveResourceFiles([4, 5], 9)).resolves.toBe(2);
    patch.mockResolvedValue({ data: undefined });
    await expect(moveResourceFiles([4], 9)).resolves.toBe(1);
  });

  it("throws the server's message when it reports success: false", async () => {
    patch.mockResolvedValue({ data: { success: false, message: "Some of those files no longer exist." } });
    await expect(moveResourceFiles([1], 9)).rejects.toThrow("Some of those files no longer exist.");
  });

  it("throws a generic message when success is false without one", async () => {
    patch.mockResolvedValue({ data: { success: false } });
    await expect(moveResourceFiles([1], 9)).rejects.toThrow("Request failed");
  });

  it("lets a network or HTTP error through for the caller to report", async () => {
    patch.mockRejectedValue(new Error("Network Error"));
    await expect(moveResourceFiles([1], 9)).rejects.toThrow("Network Error");
  });
});

describe("flattenFolders edge cases", () => {
  it("keeps names with slashes, unicode and emoji intact", () => {
    const out = flattenFolders([folder(1, "A/B"), folder(2, "Café ☕", [folder(3, "日本語")])]);
    expect(out.map((o) => o.path)).toEqual(["A/B", "Café ☕", "Café ☕ / 日本語"]);
  });

  it("keeps siblings in the order the server sent them", () => {
    const out = flattenFolders([folder(1, "Zed"), folder(2, "Alpha")]);
    expect(out.map((o) => o.name)).toEqual(["Zed", "Alpha"]);
  });

  it("handles a very deep tree without overflowing", () => {
    let node = folder(200, "leaf");
    for (let i = 199; i >= 1; i--) node = folder(i, `n${i}`, [node]);
    const out = flattenFolders([node]);
    expect(out).toHaveLength(200);
    expect(out[199].depth).toBe(199);
  });

  it("does not mutate the tree or share state between calls", () => {
    const tree = [folder(1, "A", [folder(2, "B")])];
    const first = flattenFolders(tree);
    const second = flattenFolders(tree);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(tree[0].children).toHaveLength(1);
  });
});

describe("filterFolderOptions", () => {
  const options = flattenFolders([
    folder(1, "Small Business", [folder(2, "Templates and guides"), folder(3, "Lead gen (Trades)")]),
    folder(4, "Accountants and Bookkeepers"),
  ]);

  it("returns everything for an empty or whitespace-only search", () => {
    expect(filterFolderOptions(options, "")).toBe(options);
    expect(filterFolderOptions(options, "   ")).toBe(options);
  });

  it("matches any part of the full path, ignoring case and padding", () => {
    expect(filterFolderOptions(options, "  TEMPLATES ").map((o) => o.id)).toEqual([2]);
    expect(filterFolderOptions(options, "small business /").map((o) => o.id)).toEqual([2, 3]);
    expect(filterFolderOptions(options, "and").map((o) => o.id)).toEqual([2, 4]);
  });

  it("treats regex characters as plain text instead of throwing", () => {
    expect(filterFolderOptions(options, "(trades)").map((o) => o.id)).toEqual([3]);
    expect(() => filterFolderOptions(options, "[")).not.toThrow();
    expect(filterFolderOptions(options, "[")).toEqual([]);
    expect(filterFolderOptions(options, ".*")).toEqual([]);
  });

  it("returns an empty list when nothing matches, and for an empty tree", () => {
    expect(filterFolderOptions(options, "zzz")).toEqual([]);
    expect(filterFolderOptions([], "a")).toEqual([]);
  });
});
