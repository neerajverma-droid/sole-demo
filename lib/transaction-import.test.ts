import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoMapTxnColumns,
  buildTxnRows,
  canonicalTxnType,
  duplicateTxnMappings,
  groupTxnIssues,
  importAmount,
  parseImportDate,
  txnErrorRowsCsv,
  txnRowIssues,
  txnTemplateCsv,
  withTxnIssues,
  type ParsedTxnRow,
} from "@/lib/transaction-import";

/**
 * A row the importer is happy with, as the template would produce it. The
 * date sits in the past relative to the clock each test pins below.
 */
const validRow = {
  type: "Credit",
  amount: "1120.00",
  date: "20/07/2025",
  description: "Stripe payout",
};

beforeEach(() => {
  // The future-date rule reads the real clock, so it's pinned — otherwise
  // these tests start failing on a date nobody chose.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-09-21T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseImportDate", () => {
  it("reads the template's DD/MM/YYYY", () => {
    expect(parseImportDate("20/07/2025")).toBe("2025-07-20");
    expect(parseImportDate("5/7/2025")).toBe("2025-07-05");
  });

  it("reads the ISO form an Excel date column arrives in", () => {
    expect(parseImportDate("2025-07-20")).toBe("2025-07-20");
  });

  it("rejects a date that does not exist", () => {
    expect(parseImportDate("31/02/2025")).toBeNull();
    expect(parseImportDate("20/13/2025")).toBeNull();
  });

  it("rejects anything it cannot read", () => {
    expect(parseImportDate("July 20")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("txnRowIssues", () => {
  it("is empty for a valid row", () => {
    expect(txnRowIssues(validRow)).toEqual([]);
  });

  it("accepts the spellings a bank export uses for Type", () => {
    expect(txnRowIssues({ ...validRow, type: "CR" })).toEqual([]);
    expect(txnRowIssues({ ...validRow, type: "Money out" })).toEqual([]);
    expect(txnRowIssues({ ...validRow, type: "Transfer" })).toContain(
      "Type must be Credit or Debit",
    );
  });

  it("rejects an amount the backend would refuse", () => {
    expect(txnRowIssues({ ...validRow, amount: "0" })).toContain(
      "Invalid amount",
    );
    expect(txnRowIssues({ ...validRow, amount: "-5" })).toContain(
      "Invalid amount",
    );
    expect(txnRowIssues({ ...validRow, amount: "100000000" })).toContain(
      "Invalid amount",
    );
  });

  it("strips currency formatting before judging the amount", () => {
    expect(txnRowIssues({ ...validRow, amount: "$1,120.00" })).toEqual([]);
  });

  it("flags a future date, which the backend rejects the whole batch over", () => {
    expect(txnRowIssues({ ...validRow, date: "20/07/2026" })).toContain(
      "Date is in the future",
    );
    // Today itself is fine — the backend compares against end of day.
    expect(txnRowIssues({ ...validRow, date: "21/09/2025" })).toEqual([]);
  });

  it("requires three description characters, matching the backend", () => {
    expect(txnRowIssues({ ...validRow, description: "ab" })).toContain(
      "Description must be at least 3 characters",
    );
    expect(txnRowIssues({ ...validRow, description: "abc" })).toEqual([]);
  });
});

describe("withTxnIssues", () => {
  it("re-derives issues from the row's current values", () => {
    const row: ParsedTxnRow = { index: 0, ...validRow, issues: [] };
    expect(withTxnIssues({ ...row, amount: "nope" }).issues).toContain(
      "Invalid amount",
    );
    expect(withTxnIssues({ ...row, issues: ["stale"] }).issues).toEqual([]);
  });
});

describe("groupTxnIssues", () => {
  it("collapses one issue across many rows into a single line", () => {
    const rows: ParsedTxnRow[] = [
      { index: 0, ...validRow, amount: "x", issues: ["Invalid amount"] },
      { index: 1, ...validRow, amount: "y", issues: ["Invalid amount"] },
    ];
    const groups = groupTxnIssues(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].headline).toBe("2 rows are missing a valid Amount");
  });
});

describe("autoMapTxnColumns", () => {
  it("matches the headers a bank export actually uses", () => {
    expect(
      autoMapTxnColumns(["Transaction Date", "Narrative", "Amount", "Type"]),
    ).toEqual({
      0: "Date",
      1: "Description",
      2: "Amount",
      3: "Transaction type",
    });
  });

  it("leaves a column it cannot place unmapped", () => {
    expect(autoMapTxnColumns(["Sprocket count"])[0]).toBe("Don't import");
  });

  it("never claims one Sole field for two columns", () => {
    const mapping = autoMapTxnColumns(["Date", "Transaction Date"]);
    expect(Object.values(mapping).filter((f) => f === "Date")).toHaveLength(1);
  });
});

describe("duplicateTxnMappings", () => {
  it("names a field pointed at twice", () => {
    expect(duplicateTxnMappings({ 0: "Amount", 1: "Amount" })).toEqual([
      "Amount",
    ]);
  });

  it("ignores repeats of the options that never reach the backend", () => {
    expect(
      duplicateTxnMappings({ 0: "Don't import", 1: "Don't import" }),
    ).toEqual([]);
  });
});

describe("buildTxnRows", () => {
  const columns = ["Posted", "Details", "Value", "Direction"];
  const sheet = [
    {
      Posted: "20/07/2025",
      Details: "Stripe payout",
      Value: "1120.00",
      Direction: "Credit",
    },
  ];

  it("reads cells through the mapping rather than by position", () => {
    const rows = buildTxnRows(columns, sheet, {
      0: "Date",
      1: "Description",
      2: "Amount",
      3: "Transaction type",
    });

    expect(rows).toEqual([
      {
        index: 0,
        type: "Credit",
        amount: "1120.00",
        date: "20/07/2025",
        description: "Stripe payout",
        issues: [],
      },
    ]);
  });

  it("keeps the file's own wording for Type rather than rewriting it", () => {
    const rows = buildTxnRows(
      columns,
      [{ ...sheet[0], Direction: "CR" }],
      { 0: "Date", 1: "Description", 2: "Amount", 3: "Transaction type" },
    );
    expect(rows[0].type).toBe("CR");
    expect(rows[0].issues).toEqual([]);
  });

  it("leaves an unmapped field empty, and says so as an issue", () => {
    const rows = buildTxnRows(columns, sheet, { 0: "Date" });
    expect(rows[0].amount).toBe("");
    expect(rows[0].issues).toContain("Invalid amount");
  });
});

describe("canonicalTxnType", () => {
  it("normalises the common spellings", () => {
    expect(canonicalTxnType("credit")).toBe("Credit");
    expect(canonicalTxnType("DR")).toBe("Debit");
    expect(canonicalTxnType("money in")).toBe("Credit");
    expect(canonicalTxnType("transfer")).toBe("");
    expect(canonicalTxnType("")).toBe("");
  });
});

describe("importAmount", () => {
  it("strips formatting and falls back to zero", () => {
    expect(importAmount("$1,120.00")).toBe(1120);
    expect(importAmount("nope")).toBe(0);
  });
});

describe("txnErrorRowsCsv", () => {
  it("exports only the failing rows, with their reasons", () => {
    const rows: ParsedTxnRow[] = [
      { index: 0, ...validRow, issues: [] },
      {
        index: 1,
        ...validRow,
        description: "Rent, studio",
        issues: ["Invalid amount"],
      },
    ];
    const lines = txnErrorRowsCsv(rows).split("\r\n");
    expect(lines).toHaveLength(2); // header + the one failing row
    expect(lines[1]).toContain("Invalid amount");
    // The comma inside the description must not split the row.
    expect(lines[1]).toContain('"Rent, studio"');
  });
});

describe("txnTemplateCsv", () => {
  it("leads with the headers the auto-mapper recognises", () => {
    const [header] = txnTemplateCsv().split("\r\n");
    expect(header).toBe("Transaction type,Amount,Date,Description");
    expect(autoMapTxnColumns(header.split(","))).toEqual({
      0: "Transaction type",
      1: "Amount",
      2: "Date",
      3: "Description",
    });
  });

  it("only offers sample rows the importer would itself accept", () => {
    const [, ...rows] = txnTemplateCsv().split("\r\n");
    for (const line of rows) {
      const [type, amount, date, description] = line.split(",");
      expect(
        txnRowIssues({ type, amount, date, description }),
      ).toEqual([]);
    }
  });
});
