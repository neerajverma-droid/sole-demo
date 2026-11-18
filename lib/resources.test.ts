import { describe, expect, it } from "vitest";

import {
  countFiles,
  flattenFiles,
  formatFileSize,
  matchesName,
  type ResourceFolderNode,
} from "./resources";

const file = (id: number, name: string) => ({ id, name, url: `https://example.test/${id}` });

const tree: ResourceFolderNode[] = [
  {
    id: 1,
    name: "Invoices",
    slug: "invoices",
    files: [file(1, "Overdue template.docx")],
    children: [
      {
        id: 2,
        name: "Reminders",
        slug: "reminders",
        files: [file(2, "First reminder.pdf"), file(3, "Final notice.pdf")],
        children: [],
      },
    ],
  },
  { id: 3, name: "Empty", slug: "empty", files: [], children: [] },
];

describe("resources helpers", () => {
  it("counts files in a folder and all its subfolders", () => {
    expect(countFiles(tree[0])).toBe(3);
    expect(countFiles(tree[1])).toBe(0);
  });

  it("flattens files with their folder path", () => {
    expect(flattenFiles(tree).map((f) => [f.name, f.folderName])).toEqual([
      ["Overdue template.docx", "Invoices"],
      ["First reminder.pdf", "Invoices / Reminders"],
      ["Final notice.pdf", "Invoices / Reminders"],
    ]);
  });

  it("tolerates folders missing files or children", () => {
    const partial = [{ id: 9, name: "X", slug: "x" }] as unknown as ResourceFolderNode[];
    expect(flattenFiles(partial)).toEqual([]);
    expect(countFiles(partial[0])).toBe(0);
  });

  it("matches names case-insensitively, ignoring surrounding spaces", () => {
    expect(matchesName("Final Notice.pdf", "  notice ")).toBe(true);
    expect(matchesName("Final Notice.pdf", "invoice")).toBe(false);
  });

  it("formats file sizes", () => {
    expect(formatFileSize(undefined)).toBe("");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
