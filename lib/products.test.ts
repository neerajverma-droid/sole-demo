import { describe, expect, it } from "vitest";

import { paginate } from "@/lib/products";

describe("paginate", () => {
  it("slices the rows for the requested page", () => {
    const rows = Array.from({ length: 25 }, (_, index) => index + 1);

    const page1 = paginate(rows, 1, 10);
    expect(page1.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(page1).toMatchObject({
      page: 1,
      pageCount: 3,
      total: 25,
      from: 1,
      to: 10,
    });

    const page2 = paginate(rows, 2, 10);
    expect(page2.rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(page2).toMatchObject({ page: 2, from: 11, to: 20 });

    const page3 = paginate(rows, 3, 10);
    expect(page3.rows).toEqual([21, 22, 23, 24, 25]);
    expect(page3).toMatchObject({ page: 3, pageCount: 3, from: 21, to: 25 });
  });

  it("clamps a page past the last one back onto the last real page", () => {
    const rows = Array.from({ length: 5 }, (_, index) => index + 1);

    const result = paginate(rows, 99, 10);

    expect(result.page).toBe(1);
    expect(result.rows).toEqual(rows);
  });

  it("clamps a page below one up to the first page", () => {
    const rows = [1, 2, 3];

    const result = paginate(rows, 0, 10);

    expect(result.page).toBe(1);
    expect(result.rows).toEqual(rows);
  });

  it("reports a single, empty page for an empty list rather than dividing by zero", () => {
    const result = paginate([], 1, 10);

    expect(result).toEqual({
      rows: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });

  it("holds pageCount to 1 when everything fits on one page", () => {
    const rows = [1, 2, 3];

    const result = paginate(rows, 1, 10);

    expect(result.pageCount).toBe(1);
    expect(result.rows).toEqual(rows);
  });

  it("puts a total that's an exact multiple of the page size fully on the earlier pages", () => {
    const rows = Array.from({ length: 20 }, (_, index) => index + 1);

    const result = paginate(rows, 2, 10);

    expect(result.pageCount).toBe(2);
    expect(result.rows).toHaveLength(10);
    expect(result.to).toBe(20);
  });
});
