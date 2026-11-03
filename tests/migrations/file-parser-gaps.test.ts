/**
 * Excel serial-date conversion in `parseSpreadsheet` (the private
 * `convertExcelDate`), which `file-parser.test.ts` never exercises, plus the
 * autoMapColumns scoring threshold.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { autoMapColumns, IMPORT_FILE_EXTENSIONS, parseSpreadsheet } from "@/lib/file-parser";

function fileFrom(name: string, data: ArrayBuffer | string): File {
  return new File([data], name);
}

/** A real in-memory .xlsx, so the serial arrives as a number cell. */
function xlsxFrom(grid: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

async function firstRow(grid: (string | number)[][]) {
  const { rows } = await parseSpreadsheet(fileFrom("book.xlsx", xlsxFrom(grid)));
  return rows[0];
}

describe("Excel serial dates", () => {
  it("rewrites a 5-digit serial under a date-named header to ISO", async () => {
    const row = await firstRow([
      ["Transaction Date", "Amount"],
      [45123, 10],
    ]);
    expect(row["Transaction Date"]).toBe("2023-07-16");
  });

  it("matches the header case-insensitively", async () => {
    const row = await firstRow([["POSTED DATE"], [45123]]);
    expect(row["POSTED DATE"]).toBe("2023-07-16");
  });

  it("leaves the same number alone under a header that doesn't mention a date", async () => {
    const row = await firstRow([["Reference", "Amount"], [45123, 45123]]);
    expect(row).toMatchObject({ Reference: "45123", Amount: "45123" });
  });

  it("only converts strictly between 25000 and 50000 (~1968–2036)", async () => {
    const { rows } = await parseSpreadsheet(
      fileFrom("book.xlsx", xlsxFrom([["Date"], [25000], [25001], [49999], [50000]])),
    );
    expect(rows.map((r) => r.Date)).toEqual(["25000", "1968-06-12", "2036-11-20", "50000"]);
  });

  it("ignores a number that isn't five digits", async () => {
    const row = await firstRow([["Date"], [4512]]);
    expect(row.Date).toBe("4512");
  });

  it("also converts a serial that arrives as text in a CSV", async () => {
    const { rows } = await parseSpreadsheet(fileFrom("b.csv", "Due date,Name\n45123,Jo"));
    expect(rows[0]["Due date"]).toBe("2023-07-16");
  });

  it("passes an already-readable date string through untouched", async () => {
    const row = await firstRow([["Date"], ["2025-07-20"]]);
    expect(row.Date).toBe("2025-07-20");
  });
});

describe("autoMapColumns scoring threshold", () => {
  it("maps on a strong partial overlap but drops a weak one (score must exceed 5)", () => {
    // "transaction" (11 letters) overlaps → kept.
    expect(autoMapColumns(["Transaction Ref"], ["Transaction type"])).toEqual({
      0: "Transaction type",
    });
    // "type" overlaps for only 4 letters → below the threshold, omitted.
    expect(autoMapColumns(["Type Code"], ["Account type"])).toEqual({});
  });

  it("ignores words shorter than three letters entirely", () => {
    expect(autoMapColumns(["ab cd ef gh"], ["ab cd ef gh xyz"])).toEqual({});
  });

  it("prefers an exact match over an earlier partial one", () => {
    expect(
      autoMapColumns(["Transaction Date"], ["Date", "Transaction Date"]),
    ).toEqual({ 0: "Transaction Date" });
  });

  it("returns an empty mapping for a non-array input", () => {
    expect(autoMapColumns(undefined as never, ["Date"])).toEqual({});
  });
});

describe("IMPORT_FILE_EXTENSIONS", () => {
  it("is exactly csv/xls/xlsx", () => {
    expect(IMPORT_FILE_EXTENSIONS).toEqual([".csv", ".xls", ".xlsx"]);
  });
});
