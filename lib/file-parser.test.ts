import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  autoMapColumns,
  csvRow,
  isSupportedImportFile,
  parseSpreadsheet,
} from "@/lib/file-parser";

/** A `File` over the given bytes — enough for `parseSpreadsheet`'s needs. */
function fileFrom(name: string, data: ArrayBuffer | string): File {
  return new File([data], name);
}

/** Builds a real .xlsx in memory so the Excel path is exercised, not mocked. */
function xlsxFrom(grid: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("isSupportedImportFile", () => {
  it("accepts the three spreadsheet formats and nothing else", () => {
    expect(isSupportedImportFile(fileFrom("a.csv", ""))).toBe(true);
    expect(isSupportedImportFile(fileFrom("a.XLSX", ""))).toBe(true);
    expect(isSupportedImportFile(fileFrom("a.xls", ""))).toBe(true);
    expect(isSupportedImportFile(fileFrom("a.pdf", ""))).toBe(false);
  });
});

describe("parseSpreadsheet", () => {
  it("reads a CSV into headers and rows", async () => {
    const csv = ["Name,Email", "Jo Lee,jo@acme.test"].join("\n");
    const { columns, rows } = await parseSpreadsheet(fileFrom("c.csv", csv));

    expect(columns).toEqual(["Name", "Email"]);
    expect(rows).toEqual([{ Name: "Jo Lee", Email: "jo@acme.test" }]);
  });

  it("keeps a quoted comma inside its own cell", async () => {
    const csv = ['Business,Contact', '"Acme, Inc.",Jo Lee'].join("\n");
    const { rows } = await parseSpreadsheet(fileFrom("c.csv", csv));
    expect(rows[0].Business).toBe("Acme, Inc.");
  });

  it("reads an .xlsx through the same path", async () => {
    const book = xlsxFrom([
      ["Name", "Amount"],
      ["Stripe payout", 1120],
    ]);
    const { columns, rows } = await parseSpreadsheet(fileFrom("b.xlsx", book));

    expect(columns).toEqual(["Name", "Amount"]);
    expect(rows[0]).toMatchObject({ Name: "Stripe payout", Amount: "1120" });
  });

  it("drops blank header columns and fully empty rows", async () => {
    const csv = ["Name,,Email", "Jo Lee,,jo@acme.test", ",,"].join("\n");
    const { columns, rows } = await parseSpreadsheet(fileFrom("c.csv", csv));

    expect(columns).toEqual(["Name", "Email"]);
    expect(rows).toHaveLength(1);
  });

  it("returns nothing for an empty file rather than throwing", async () => {
    expect(await parseSpreadsheet(fileFrom("c.csv", ""))).toEqual({
      columns: [],
      rows: [],
    });
  });

  it("treats a column literally headed __proto__ as an ordinary key", async () => {
    const csv = ["__proto__,Name", "polluted,Jo Lee"].join("\n");
    const { rows } = await parseSpreadsheet(fileFrom("c.csv", csv));

    expect(rows[0].__proto__).toBe("polluted");
    // Nothing leaked onto the prototype of plain objects.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("autoMapColumns", () => {
  const fields = ["Transaction Date", "Amount", "Description"] as const;
  const aliases = {
    "Transaction Date": ["date", "posted date"],
    Description: ["narrative", "details"],
  };

  it("prefers an exact header match", () => {
    expect(autoMapColumns(["Amount"], fields, aliases)).toEqual({
      0: "Amount",
    });
  });

  it("matches through an alias, ignoring case and punctuation", () => {
    expect(autoMapColumns(["Posted-Date"], fields, aliases)[0]).toBe(
      "Transaction Date",
    );
  });

  it("leaves an unrelated column out entirely", () => {
    expect(autoMapColumns(["Sprocket count"], fields, aliases)).toEqual({});
  });

  it("ignores a blank header", () => {
    expect(autoMapColumns(["   "], fields, aliases)).toEqual({});
  });
});

describe("csvRow", () => {
  it("quotes only the cells that need it", () => {
    expect(csvRow(["plain", "has,comma", 'has"quote'])).toBe(
      'plain,"has,comma","has""quote"',
    );
  });
});
