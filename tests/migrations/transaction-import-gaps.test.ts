/**
 * Cases `transaction-import.test.ts` leaves out: `filterReviewRows`, the
 * three-decimal amount rule, the `-` date separator (and the `.` it refuses,
 * unlike `parseBulkDate`), and the full canonicalTxnType vocabulary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBulkDate } from "@/lib/bulk-import";
import {
  canonicalTxnType,
  filterReviewRows,
  groupTxnIssues,
  parseImportDate,
  TXN_FIELD_OPTIONS,
  TXN_REVIEW_TABS,
  txnRowIssues,
  type ParsedTxnRow,
} from "@/lib/transaction-import";

const validRow = {
  type: "Credit",
  amount: "1120.00",
  date: "20/07/2025",
  description: "Stripe payout",
};

beforeEach(() => {
  vi.useFakeTimers();
  // A local time, so todayIso() (which reads local time) is 2025-09-21 on any
  // machine's timezone.
  vi.setSystemTime(new Date(2025, 8, 21, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseImportDate separators", () => {
  it("accepts a - separator in DD-MM-YYYY", () => {
    expect(parseImportDate("20-07-2025")).toBe("2025-07-20");
  });

  it("refuses a . separator, unlike parseBulkDate", () => {
    expect(parseImportDate("20.07.2025")).toBeNull();
    expect(parseBulkDate("20.07.2025")).toBe("2025-07-20");
  });

  it("pads a single-digit ISO month and day", () => {
    expect(parseImportDate("2025-7-5")).toBe("2025-07-05");
  });

  it("rejects an impossible ISO date", () => {
    expect(parseImportDate("2025-02-29")).toBeNull();
  });
});

describe("txnRowIssues amount rules", () => {
  it("refuses three decimal places", () => {
    expect(txnRowIssues({ ...validRow, amount: "10.005" })).toEqual(["Invalid amount"]);
    expect(txnRowIssues({ ...validRow, amount: "10.05" })).toEqual([]);
  });

  it("accepts the backend's ceiling exactly", () => {
    expect(txnRowIssues({ ...validRow, amount: "99999999.99" })).toEqual([]);
  });

  it("refuses scientific notation and blanks", () => {
    expect(txnRowIssues({ ...validRow, amount: "1e3" })).toEqual(["Invalid amount"]);
    expect(txnRowIssues({ ...validRow, amount: "  " })).toEqual(["Invalid amount"]);
  });

  it("reports every failure on one row, in rule order", () => {
    expect(
      txnRowIssues({ type: "", amount: "", date: "soon", description: "" }),
    ).toEqual([
      "Type must be Credit or Debit",
      "Invalid amount",
      "Date must be DD/MM/YYYY",
      "Description must be at least 3 characters",
    ]);
  });

  it("flags tomorrow as future", () => {
    expect(txnRowIssues({ ...validRow, date: "22/09/2025" })).toEqual(["Date is in the future"]);
  });
});

describe("canonicalTxnType vocabulary", () => {
  it.each(["credit", "CR", "c", "Money In", "deposit", " in "])("reads %s as Credit", (v) => {
    expect(canonicalTxnType(v)).toBe("Credit");
  });

  it.each(["debit", "DR", "d", "money out", "Withdrawal", "out"])("reads %s as Debit", (v) => {
    expect(canonicalTxnType(v)).toBe("Debit");
  });

  it("returns blank for blank or unrecognised", () => {
    expect(canonicalTxnType("")).toBe("");
    expect(canonicalTxnType("Transfer")).toBe("");
  });
});

describe("filterReviewRows", () => {
  const rows: ParsedTxnRow[] = [
    { index: 0, ...validRow, issues: [] },
    { index: 1, ...validRow, amount: "", issues: ["Invalid amount"] },
    { index: 2, ...validRow, issues: [] },
  ];

  it("offers the three tabs in order", () => {
    expect(TXN_REVIEW_TABS).toEqual(["All rows", "Clean rows", "Rows with issues"]);
  });

  it("shows only rows with no issues on Clean rows", () => {
    expect(filterReviewRows(rows, "Clean rows").map((r) => r.index)).toEqual([0, 2]);
  });

  it("shows only failing rows on Rows with issues", () => {
    expect(filterReviewRows(rows, "Rows with issues").map((r) => r.index)).toEqual([1]);
  });

  it("shows everything on All rows", () => {
    expect(filterReviewRows(rows, "All rows")).toBe(rows);
  });
});

describe("groupTxnIssues ordering", () => {
  it("sorts the commonest issue first and uses the singular for one row", () => {
    const rows: ParsedTxnRow[] = [
      { index: 0, ...validRow, issues: ["Invalid amount"] },
      { index: 1, ...validRow, issues: ["Type must be Credit or Debit", "Invalid amount"] },
    ];

    expect(groupTxnIssues(rows).map((g) => g.headline)).toEqual([
      "2 rows are missing a valid Amount",
      "1 row is missing a valid Type",
    ]);
  });
});

describe("TXN_FIELD_OPTIONS", () => {
  it("offers the four template columns, then Category, Reference and Don't import", () => {
    expect(TXN_FIELD_OPTIONS).toEqual([
      "Transaction type",
      "Amount",
      "Date",
      "Description",
      "Category",
      "Reference",
      "Don't import",
    ]);
  });
});
