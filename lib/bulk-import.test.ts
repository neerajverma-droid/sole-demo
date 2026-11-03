import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DO_NOT_IMPORT,
  autoMapBulkColumns,
  buildBulkRows,
  bulkErrorRowsCsv,
  bulkRowIssues,
  bulkTemplateCsv,
  duplicateBulkMappings,
  fieldOptions,
  groupBulkIssues,
  isMoney,
  isPhone,
  matchCategory,
  parseBulkBoolean,
  parseBulkDate,
  reviewFields,
  todayIso,
  withBulkIssues,
  type BulkImportSpec,
} from "@/lib/bulk-import";

/** A miniature module, exercising every part of the spec the engine reads. */
const SPEC: BulkImportSpec = {
  title: "Widget bulk upload",
  description: "Import widgets.",
  noun: "widget",
  nounPlural: "widgets",
  migrationStep: "invoices",
  templateFilename: "widgets.csv",
  errorsFilename: "widget-errors.csv",
  rowLabelField: "Name",
  fields: [
    {
      label: "Name",
      required: true,
      desc: "What it is",
      aliases: ["name", "widget name", "title"],
      review: { heading: "Widget", editor: { kind: "text" } },
    },
    {
      label: "Amount",
      required: true,
      aliases: ["amount", "total", "price"],
      review: {
        heading: "Amount",
        editor: { kind: "text", inputMode: "decimal" },
        mono: true,
      },
    },
    { label: "Notes", aliases: ["notes", "comment"] },
  ],
  templateColumns: ["Name", "Amount"],
  sampleRows: [["Blue widget", "12.50"]],
  issues: [
    {
      message: "Name is required",
      summary: "missing a name",
      test: (row) => row["Name"].trim() === "",
    },
    {
      message: "Amount must be a positive number",
      summary: "missing a valid Amount",
      test: (row) => row["Amount"].trim() === "" || !isMoney(row["Amount"]),
    },
  ],
};

describe("fieldOptions / reviewFields", () => {
  it("offers every field plus an opt-out", () => {
    expect(fieldOptions(SPEC)).toEqual([
      "Name",
      "Amount",
      "Notes",
      DO_NOT_IMPORT,
    ]);
  });

  it("gives the Review table only the fields that asked for a column", () => {
    expect(reviewFields(SPEC).map((field) => field.label)).toEqual([
      "Name",
      "Amount",
    ]);
  });
});

describe("autoMapBulkColumns", () => {
  it("matches the template's own headers exactly", () => {
    expect(autoMapBulkColumns(SPEC, ["Name", "Amount"])).toEqual({
      0: "Name",
      1: "Amount",
    });
  });

  it("matches an alias regardless of case and punctuation", () => {
    expect(autoMapBulkColumns(SPEC, ["Widget-Name", "TOTAL"])).toEqual({
      0: "Name",
      1: "Amount",
    });
  });

  it("leaves a column it cannot place unmapped", () => {
    expect(autoMapBulkColumns(SPEC, ["Sprocket count"])[0]).toBe(DO_NOT_IMPORT);
  });

  it("never claims one field for two columns", () => {
    const mapping = autoMapBulkColumns(SPEC, ["Amount", "Total"]);
    expect(Object.values(mapping).filter((f) => f === "Amount")).toHaveLength(1);
  });
});

describe("duplicateBulkMappings", () => {
  it("names a field pointed at twice", () => {
    expect(duplicateBulkMappings({ 0: "Amount", 1: "Amount" })).toEqual([
      "Amount",
    ]);
  });

  it("ignores repeats of the opt-out", () => {
    expect(
      duplicateBulkMappings({ 0: DO_NOT_IMPORT, 1: DO_NOT_IMPORT }),
    ).toEqual([]);
  });
});

describe("buildBulkRows", () => {
  const columns = ["Col A", "Col B", "Col C"];
  const sheet = [{ "Col A": "9.99", "Col B": " Blue widget ", "Col C": "hi" }];

  it("reads cells through the mapping, not by position", () => {
    const rows = buildBulkRows(SPEC, columns, sheet, {
      0: "Amount",
      1: "Name",
      2: "Notes",
    });

    expect(rows).toEqual([
      {
        index: 0,
        values: { Name: "Blue widget", Amount: "9.99", Notes: "hi" },
        issues: [],
      },
    ]);
  });

  it("leaves an unmapped field empty and flags it", () => {
    const rows = buildBulkRows(SPEC, columns, sheet, { 1: "Name" });
    expect(rows[0].values.Amount).toBe("");
    expect(rows[0].issues).toEqual(["Amount must be a positive number"]);
  });

  it("returns nothing for a file with no data rows", () => {
    expect(buildBulkRows(SPEC, columns, [], { 0: "Name" })).toEqual([]);
  });
});

describe("withBulkIssues", () => {
  it("re-derives issues from the row's current values", () => {
    const row = {
      index: 0,
      values: { Name: "Blue", Amount: "x", Notes: "" },
      issues: ["stale"],
    };
    expect(withBulkIssues(SPEC, row).issues).toEqual([
      "Amount must be a positive number",
    ]);
  });
});

describe("groupBulkIssues", () => {
  it("collapses one issue across many rows into a single line", () => {
    const rows = [
      { index: 0, values: { Name: "", Amount: "1" }, issues: [] },
      { index: 1, values: { Name: "", Amount: "1" }, issues: [] },
    ].map((row) => withBulkIssues(SPEC, row));

    const groups = groupBulkIssues(SPEC, rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].headline).toBe("2 rows are missing a name");
  });

  it("puts the commonest problem first", () => {
    const rows = [
      { index: 0, values: { Name: "", Amount: "x" } },
      { index: 1, values: { Name: "A", Amount: "x" } },
      { index: 2, values: { Name: "B", Amount: "x" } },
    ].map((row) => withBulkIssues(SPEC, { ...row, issues: [] }));

    expect(groupBulkIssues(SPEC, rows)[0].message).toBe(
      "Amount must be a positive number",
    );
  });
});

describe("bulkTemplateCsv / bulkErrorRowsCsv", () => {
  it("leads the template with headers the auto-mapper recognises", () => {
    const [header, ...rows] = bulkTemplateCsv(SPEC).split("\r\n");
    expect(header).toBe("Name,Amount");
    expect(autoMapBulkColumns(SPEC, header.split(","))).toEqual({
      0: "Name",
      1: "Amount",
    });
    // Every sample row must itself be importable, or the template teaches
    // people to write files the importer then rejects.
    for (const line of rows) {
      const [Name, Amount] = line.split(",");
      expect(bulkRowIssues(SPEC, { Name, Amount })).toEqual([]);
    }
  });

  it("exports only the failing rows, with reasons and quoting", () => {
    const rows = [
      { index: 0, values: { Name: "Fine", Amount: "1" }, issues: [] },
      { index: 1, values: { Name: "Bad, comma", Amount: "" }, issues: [] },
    ].map((row) => withBulkIssues(SPEC, row));

    const lines = bulkErrorRowsCsv(SPEC, rows).split("\r\n");
    expect(lines).toHaveLength(2); // header + the one failing row
    expect(lines[1]).toContain('"Bad, comma"');
    expect(lines[1]).toContain("Amount must be a positive number");
  });
});

describe("parseBulkDate", () => {
  it("reads the template's DD/MM/YYYY and Excel's ISO", () => {
    expect(parseBulkDate("20/07/2025")).toBe("2025-07-20");
    expect(parseBulkDate("5.7.2025")).toBe("2025-07-05");
    expect(parseBulkDate("2025-07-20")).toBe("2025-07-20");
  });

  it("rejects a date that does not exist, and unreadable text", () => {
    expect(parseBulkDate("31/02/2025")).toBeNull();
    expect(parseBulkDate("July 20")).toBeNull();
    expect(parseBulkDate("")).toBeNull();
  });
});

describe("todayIso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 8, 21, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("reads the local date, not UTC", () => {
    expect(todayIso()).toBe("2025-09-21");
  });
});

describe("parseBulkBoolean", () => {
  it("reads the spellings a spreadsheet actually contains", () => {
    expect(parseBulkBoolean("Yes")).toBe(true);
    expect(parseBulkBoolean("1")).toBe(true);
    expect(parseBulkBoolean("no")).toBe(false);
    expect(parseBulkBoolean("FALSE")).toBe(false);
  });

  it("strips the stray carriage return a CRLF file leaves behind", () => {
    expect(parseBulkBoolean("Yes\r")).toBe(true);
  });

  it("returns null for blank or unrecognised, so required stays detectable", () => {
    expect(parseBulkBoolean("")).toBeNull();
    expect(parseBulkBoolean("maybe")).toBeNull();
  });
});

describe("isMoney / isPhone", () => {
  it("accepts formatted money and rejects negatives and text", () => {
    expect(isMoney("$1,120.00")).toBe(true);
    expect(isMoney("0")).toBe(true);
    expect(isMoney("-5")).toBe(false);
    expect(isMoney("abc")).toBe(false);
    expect(isMoney("")).toBe(false);
  });

  it("accepts a plausible phone number in the shapes people type", () => {
    expect(isPhone("+61 411 111 111")).toBe(true);
    expect(isPhone("(03) 9000-1000")).toBe(true);
    expect(isPhone("123")).toBe(false);
  });
});

describe("matchCategory", () => {
  const options = [
    { id: "51", name: "Sales income" },
    { id: "72", name: "Office supplies" },
  ];

  it("matches a name exactly, ignoring case", () => {
    expect(matchCategory("office supplies", options)).toBe("72");
  });

  it("matches a substring either way round", () => {
    expect(matchCategory("Office", options)).toBe("72");
    expect(matchCategory("General office supplies", options)).toBe("72");
  });

  it("takes a numeric cell as an id, but only a real one", () => {
    expect(matchCategory("51", options)).toBe("51");
    expect(matchCategory("999", options)).toBeNull();
  });

  it("returns null rather than guessing at a near miss", () => {
    // Deliberately no fuzzy fallback — booking an expense to the wrong
    // account silently is worse than asking someone to fix the spelling.
    expect(matchCategory("Ofice suplies", options)).toBeNull();
    expect(matchCategory("", options)).toBeNull();
  });
});
