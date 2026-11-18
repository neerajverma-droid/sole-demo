import { describe, expect, it } from "vitest";

import {
  canDropOn,
  collectFolderIds,
  countFolderFiles,
  findFolder,
  findFolderPath,
  flattenFolders,
  folderSize,
  formatResourceSize,
  isDescendant,
  normaliseTree,
  type AdminResourceFile,
  type AdminResourceFolder,
} from "./resources";

const file = (id: number, folderId: number, size = 1024): AdminResourceFile => ({
  id,
  folderId,
  name: `File ${id}`,
  extension: "pdf",
  mimeType: "application/pdf",
  size,
  sortOrder: 0,
  isPublished: true,
  url: `https://example.test/${id}.pdf`,
  createdAt: null,
});

const folder = (
  id: number,
  parentId: number | null,
  files: AdminResourceFile[] = [],
  children: AdminResourceFolder[] = [],
): AdminResourceFolder => ({
  id,
  parentId,
  name: `Folder ${id}`,
  slug: `folder-${id}`,
  description: null,
  sortOrder: 0,
  isPublished: true,
  files,
  children,
});

// 1 ─┬─ 2 ── 3
//    └─ 4
// 5
const tree = [
  folder(1, null, [file(10, 1, 2048)], [
    folder(2, 1, [file(20, 2)], [folder(3, 2, [file(30, 3), file(31, 3)])]),
    folder(4, 1),
  ]),
  folder(5, null),
];

describe("resources tree helpers", () => {
  it("finds folders and their root-to-folder path", () => {
    expect(findFolder(tree, 3)?.name).toBe("Folder 3");
    expect(findFolder(tree, 99)).toBeNull();
    expect(findFolderPath(tree, 3).map((f) => f.id)).toEqual([1, 2, 3]);
    expect(findFolderPath(tree, 99)).toEqual([]);
  });

  it("counts files and sizes through every subfolder", () => {
    expect(countFolderFiles(tree[0])).toBe(4);
    expect(folderSize(tree[0])).toBe(2048 + 1024 * 3);
  });

  it("collects every folder id", () => {
    expect(collectFolderIds(tree)).toEqual([1, 2, 3, 4, 5]);
  });

  it("knows which folders sit under another", () => {
    expect(isDescendant(tree, 1, 3)).toBe(true);
    expect(isDescendant(tree, 2, 4)).toBe(false);
  });

  it("fills in missing files and children arrays", () => {
    const raw = [{ ...folder(7, null), files: undefined, children: undefined }] as unknown as AdminResourceFolder[];
    expect(normaliseTree(raw)[0]).toMatchObject({ files: [], children: [] });
  });
});

describe("flattenFolders", () => {
  it("lists every folder in tree order with its depth and full path", () => {
    expect(flattenFolders(tree).map((o) => [o.id, o.depth, o.path])).toEqual([
      [1, 0, "Folder 1"],
      [2, 1, "Folder 1 / Folder 2"],
      [3, 2, "Folder 1 / Folder 2 / Folder 3"],
      [4, 1, "Folder 1 / Folder 4"],
      [5, 0, "Folder 5"],
    ]);
  });

  it("is empty for an empty tree", () => {
    expect(flattenFolders([])).toEqual([]);
  });
});

describe("canDropOn", () => {
  it("moves files only into a different folder", () => {
    const item = { type: "file" as const, id: 20, folderId: 2 };
    expect(canDropOn(tree, item, 4)).toBe(true);
    expect(canDropOn(tree, item, 2)).toBe(false);
    expect(canDropOn(tree, item, null)).toBe(false);
  });

  it("never moves a folder into itself, its own subtree, or where it already is", () => {
    const item = { type: "folder" as const, id: 2, parentId: 1 };
    expect(canDropOn(tree, item, 2)).toBe(false);
    expect(canDropOn(tree, item, 3)).toBe(false);
    expect(canDropOn(tree, item, 1)).toBe(false);
    expect(canDropOn(tree, item, 5)).toBe(true);
    expect(canDropOn(tree, item, null)).toBe(true);
  });

  it("doesn't move a top-level folder to the top level", () => {
    expect(canDropOn(tree, { type: "folder", id: 5, parentId: null }, null)).toBe(false);
  });
});

describe("formatResourceSize", () => {
  it("formats bytes as KB or MB", () => {
    expect(formatResourceSize(0)).toBe("0 KB");
    expect(formatResourceSize(10)).toBe("0.1 KB");
    expect(formatResourceSize(2048)).toBe("2.0 KB");
    expect(formatResourceSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
