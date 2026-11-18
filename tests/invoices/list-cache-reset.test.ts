import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { resetInvoiceListCache } from "@/hooks/use-invoices-query";
import { resetQuoteListCache } from "@/hooks/use-quotes-query";
import type { Invoice } from "@/lib/invoices";
import type { Quote } from "@/lib/quotes";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";

/**
 * After a save the editor lands on the list. The list only shows its skeleton
 * when its queries have no data (and the summary cards when the store isn't
 * hydrated), so the page it cached last time has to be dropped — otherwise the
 * stale page renders at once and the new document pops in later, with nothing
 * saying it was loading.
 */

const seed = (queryClient: QueryClient, prefix: "invoices" | "quotes") => {
  queryClient.setQueryData([prefix], [{ id: 1 }]);
  queryClient.setQueryData([prefix, "list", 1, 10, "{}"], { rows: [{ id: 1 }], total: 1 });
  queryClient.setQueryData([prefix, "status-counts", null], { All: 1 });
};

describe("resetInvoiceListCache", () => {
  beforeEach(() => {
    useInvoicesStore.setState({ invoices: [{ id: "1" } as Invoice], hydrated: true });
  });

  it("drops the cached list, tab counts and summary so the list opens loading", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "invoices");

    resetInvoiceListCache(queryClient);

    expect(queryClient.getQueryData(["invoices"])).toBeUndefined();
    expect(queryClient.getQueryData(["invoices", "list", 1, 10, "{}"])).toBeUndefined();
    expect(queryClient.getQueryData(["invoices", "status-counts", null])).toBeUndefined();
    expect(queryClient.getQueryState(["invoices", "list", 1, 10, "{}"])?.status).toBe("pending");
  });

  it("marks the store as not loaded, which is what the summary cards check", () => {
    resetInvoiceListCache(new QueryClient());
    expect(useInvoicesStore.getState().hydrated).toBe(false);
  });

  it("leaves other cached data alone", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "invoices");
    queryClient.setQueryData(["invoice", 7], { id: 7 });
    queryClient.setQueryData(["quotes"], [{ id: 2 }]);

    resetInvoiceListCache(queryClient);

    expect(queryClient.getQueryData(["invoice", 7])).toEqual({ id: 7 });
    expect(queryClient.getQueryData(["quotes"])).toEqual([{ id: 2 }]);
  });
});

describe("resetQuoteListCache", () => {
  beforeEach(() => {
    useQuotesStore.setState({ quotes: [{ id: "1" } as Quote], hydrated: true });
  });

  it("drops the cached list, tab counts and summary so the list opens loading", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "quotes");

    resetQuoteListCache(queryClient);

    expect(queryClient.getQueryData(["quotes"])).toBeUndefined();
    expect(queryClient.getQueryData(["quotes", "list", 1, 10, "{}"])).toBeUndefined();
    expect(queryClient.getQueryData(["quotes", "status-counts", null])).toBeUndefined();
    expect(useQuotesStore.getState().hydrated).toBe(false);
  });

  it("leaves the invoice list alone", () => {
    const queryClient = new QueryClient();
    seed(queryClient, "invoices");
    useInvoicesStore.setState({ hydrated: true });

    resetQuoteListCache(queryClient);

    expect(queryClient.getQueryData(["invoices"])).toEqual([{ id: 1 }]);
    expect(useInvoicesStore.getState().hydrated).toBe(true);
  });
});
