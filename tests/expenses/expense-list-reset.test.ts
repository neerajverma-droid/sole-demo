import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

/*
 * After creating or editing an expense on the full-page form, the Expenses
 * screen — the list and the stat cards — must come back under its skeletons
 * with the new data, not show what it had before while a background refetch
 * quietly swaps it.
 */

const { resetExpensesListCache } = await import("@/hooks/use-expenses-query");

describe("clearing the expense list after a save", () => {
  it("drops every cached page and the complete list, so the list loads fresh", async () => {
    const client = new QueryClient();
    client.setQueryData(["expenses-page", 1, 25, {}], { rows: ["old"] });
    client.setQueryData(["expenses-page", 2, 25, { search: "x" }], { rows: ["old"] });
    client.setQueryData(["expenses"], ["old"]);

    await resetExpensesListCache(client);

    expect(client.getQueryData(["expenses-page", 1, 25, {}])).toBeUndefined();
    expect(client.getQueryData(["expenses-page", 2, 25, { search: "x" }])).toBeUndefined();
    expect(client.getQueryData(["expenses"])).toBeUndefined();
  });

  it("leaves anything on screen alone, so no visible table blanks", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["expenses"], ["shown"]);
    // Something on screen is reading the complete list.
    const observer = new QueryObserver(client, { queryKey: ["expenses"], queryFn: async () => ["shown"] });
    const unsubscribe = observer.subscribe(() => {});

    await resetExpensesListCache(client);
    expect(client.getQueryData(["expenses"])).toEqual(["shown"]);
    unsubscribe();
  });

  it("clears the stat cards' totals too, for every period, so they reload with the list", async () => {
    const client = new QueryClient();
    client.setQueryData(["expense-summary", "This month"], { total: 100 });
    client.setQueryData(["expense-summary", "This year"], { total: 900 });
    await resetExpensesListCache(client);
    expect(client.getQueryData(["expense-summary", "This month"])).toBeUndefined();
    expect(client.getQueryData(["expense-summary", "This year"])).toBeUndefined();
  });

  it("leaves unrelated caches alone", async () => {
    const client = new QueryClient();
    client.setQueryData(["invoices"], ["kept"]);
    client.setQueryData(["expense-categories"], ["kept"]);
    await resetExpensesListCache(client);
    expect(client.getQueryData(["invoices"])).toEqual(["kept"]);
    expect(client.getQueryData(["expense-categories"])).toEqual(["kept"]);
  });
});

const { markExpenseChanged } = await import("@/hooks/use-expenses-query");

describe("an attachment added or removed while editing", () => {
  it("marks that expense changed without refetching it under the open form", async () => {
    const client = new QueryClient();
    let fetches = 0;
    client.setQueryData(["expense", "7"], { attachments: [] });
    // The edit form is on screen, reading this expense.
    const observer = new QueryObserver(client, {
      queryKey: ["expense", "7"],
      queryFn: async () => {
        fetches += 1;
        return { attachments: ["receipt.pdf"] };
      },
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});

    await markExpenseChanged(client, "7");

    expect(client.getQueryState(["expense", "7"])?.isInvalidated).toBe(true);
    expect(fetches).toBe(0);
    unsubscribe();
  });

  it("leaves other expenses alone and reloads the list behind the form", async () => {
    const client = new QueryClient();
    client.setQueryData(["expense", "8"], { attachments: [] });
    client.setQueryData(["expenses-page", 1, 25, {}], { rows: ["old"] });

    await markExpenseChanged(client, "7");

    expect(client.getQueryState(["expense", "8"])?.isInvalidated).toBe(false);
    expect(client.getQueryData(["expenses-page", 1, 25, {}])).toBeUndefined();
  });
});
