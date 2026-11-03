import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

/*
 * The user id comes from `stores/session` now. `lib/bank-connection` used to
 * export a second `sessionUserId` of its own — a duplicate that read `.id`
 * before `.user_id`, which is the field the profile never sends.
 */
const currentUserId = vi.fn<() => string | null>(() => "493");
vi.mock("@/stores/session", () => ({
  currentUserId: () => currentUserId(),
}));

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  accountForTransaction,
  bankLabels,
  disconnectBankConnection,
  fetchBankAccounts,
  fetchBankSyncUpgradePrompt,
  fetchHistoricalStatus,
  importPreviousFinancialYear,
  mapBankAccount,
  refreshBankAccount,
} from "@/lib/bank-accounts";

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const RAW_ACCOUNT = {
  id: 6418,
  bank_connection_id: 1547,
  bank_name: "Part-time Worker Account",
  account_number: "64870434",
  account_type: "TRANS_AND_SAVINGS_ACCOUNTS",
  balance: 737.45,
  available: 840.81,
  last_synced_at: "29/09/2026, 11:04:10 am",
  created_at: "2026-01-23T10:22:37.000Z",
  institution_slug: "pending",
  connected_at: "2026-07-09T10:10:51.000Z",
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  currentUserId.mockReturnValue("493");
});

describe("mapBankAccount", () => {
  it("maps the feed's fields", () => {
    expect(mapBankAccount(RAW_ACCOUNT)).toEqual({
      id: "6418",
      bankConnectionId: "1547",
      bankId: null,
      provider: "fiskil",
      name: "Part-time Worker Account",
      accountNumber: "64870434",
      accountType: "TRANS_AND_SAVINGS_ACCOUNTS",
      balance: 737.45,
      available: 840.81,
      lastSyncedAt: "29/09/2026, 11:04:10 am",
    });
  });

  it("falls back where the feed left fields out", () => {
    expect(
      mapBankAccount({
        id: "7",
        bank_connection_id: null,
        bank_name: "  ",
        balance: "12.5",
        available: null,
        last_synced_at: null,
      }),
    ).toMatchObject({
      id: "7",
      bankConnectionId: null,
      name: "Unnamed account",
      accountNumber: "",
      accountType: "Unknown type",
      balance: 12.5,
      available: null,
      lastSyncedAt: null,
    });
  });

  it("treats a non-numeric balance as zero", () => {
    expect(mapBankAccount({ id: 1, balance: "n/a" }).balance).toBe(0);
  });
});

describe("fetchBankAccounts", () => {
  it("reads both envelopes and sends the user id", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          success: true,
          total: 1,
          accounts: [RAW_ACCOUNT],
          total_balance: 737.45,
        },
      },
    });

    const result = await fetchBankAccounts();

    expect(get).toHaveBeenCalledWith(apiRoutes.bankAccounts.list, {
      params: { userId: "493" },
    });
    expect(result.totalBalance).toBe(737.45);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].id).toBe("6418");
  });

  it("sums balances when the total is missing", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          success: true,
          accounts: [RAW_ACCOUNT, { ...RAW_ACCOUNT, id: 2, balance: 10 }],
        },
      },
    });
    expect((await fetchBankAccounts()).totalBalance).toBeCloseTo(747.45);
  });

  it("returns an empty list when there are no accounts", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { success: true, accounts: [] } },
    });
    expect(await fetchBankAccounts()).toEqual({
      accounts: [],
      totalBalance: 0,
    });
  });

  it("throws when the feed service's own flag isn't success", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { success: false, message: "Feed down" } },
    });
    await expect(fetchBankAccounts()).rejects.toThrow(
      "Couldn't load your bank accounts.",
    );
  });

  it("throws the server's message when sole-ocr fails", async () => {
    get.mockResolvedValue({
      data: { success: false, message: "Authentication required" },
    });
    await expect(fetchBankAccounts()).rejects.toThrow(
      "Authentication required",
    );
  });

  it("omits userId when there's no session", async () => {
    currentUserId.mockReturnValue(null);
    get.mockResolvedValue({
      data: { success: true, data: { success: true, accounts: [] } },
    });
    await fetchBankAccounts();
    expect(get).toHaveBeenCalledWith(apiRoutes.bankAccounts.list, {
      params: undefined,
    });
  });
});

describe("refreshBankAccount", () => {
  it("syncs one account by query params", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    await refreshBankAccount("6418");
    expect(get).toHaveBeenCalledWith(apiRoutes.bankConnection.singleRefresh, {
      params: { userId: "493", accountId: "6418" },
    });
  });

  it("throws on a failure body", async () => {
    get.mockResolvedValue({ data: { success: false, error: "Rate limited" } });
    await expect(refreshBankAccount("1")).rejects.toThrow("Rate limited");
  });

  it("refuses without a session", async () => {
    currentUserId.mockReturnValue(null);
    await expect(refreshBankAccount("1")).rejects.toThrow(/Sign in again/);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("disconnectBankConnection", () => {
  it("disconnects by bank connection id", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    await disconnectBankConnection("1547");
    expect(get).toHaveBeenCalledWith(apiRoutes.bankConnection.disconnect, {
      params: { userId: "493", bankConnectionId: "1547" },
    });
  });

  it("throws on a failure body", async () => {
    get.mockResolvedValue({ data: { success: false } });
    await expect(disconnectBankConnection("1")).rejects.toThrow(
      "Failed to disconnect bank.",
    );
  });
});

describe("fetchHistoricalStatus", () => {
  it("reads the wrapped status", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { alreadyImported: true } },
    });
    expect(await fetchHistoricalStatus("6418")).toEqual({
      alreadyImported: true,
    });
    expect(get).toHaveBeenCalledWith(
      apiRoutes.bankAccounts.historicalStatus("6418"),
    );
  });

  it("reads an unwrapped status", async () => {
    get.mockResolvedValue({ data: { alreadyImported: false } });
    expect(await fetchHistoricalStatus("1")).toEqual({
      alreadyImported: false,
    });
  });
});

describe("importPreviousFinancialYear", () => {
  it("stops when the year is already imported", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { alreadyImported: true } },
    });
    expect(await importPreviousFinancialYear("6418")).toBe("already-imported");
    expect(post).not.toHaveBeenCalled();
  });

  it("starts a sync with a plain JSON numeric id", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    post.mockResolvedValue({ data: { success: true, data: {} } });

    expect(await importPreviousFinancialYear("6418")).toBe("started");
    expect(post).toHaveBeenCalledWith(apiRoutes.bankAccounts.historicalSync, {
      accountId: 6418,
    });
  });

  it("reports a skipped sync as already imported", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    post.mockResolvedValue({ data: { success: true, data: { skipped: true } } });
    expect(await importPreviousFinancialYear("1")).toBe("already-imported");
  });

  it("throws the server's message on failure", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    post.mockResolvedValue({
      data: { success: false, message: "Account ID is required" },
    });
    await expect(importPreviousFinancialYear("1")).rejects.toThrow(
      "Account ID is required",
    );
  });
});

describe("Akahu (NZ) accounts", () => {
  it("are told apart by the feed's provider; anything else is Fiskil", () => {
    expect(mapBankAccount({ id: 1, provider: "akahu" }).provider).toBe("akahu");
    expect(mapBankAccount({ id: 1, provider: "fiskil" }).provider).toBe("fiskil");
    expect(mapBankAccount({ id: 1 }).provider).toBe("fiskil");
  });

  // The user comes from the session on these routes, so no userId is sent.
  it("sync through /bank/akahu with a JSON body", async () => {
    post.mockResolvedValue({ data: { success: true, data: {} } });
    await refreshBankAccount("901", "akahu");
    expect(post).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.singleRefresh, {
      accountId: "901",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("disconnect through /bank/akahu", async () => {
    post.mockResolvedValue({ data: { success: true, data: {} } });
    await disconnectBankConnection("55", "akahu");
    expect(post).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.disconnect, {
      bankConnectionId: "55",
    });
  });

  it("check and import the previous year through /bank/akahu", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    post.mockResolvedValue({ data: { success: true, data: {} } });

    expect(await importPreviousFinancialYear("901", "akahu")).toBe("started");
    expect(get).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.historicalStatus("901"));
    expect(post).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.historicalSync, {
      accountId: 901,
    });
  });

  it("throw the server's message on a failure body", async () => {
    post.mockResolvedValue({ data: { success: false, message: "Account not found" } });
    await expect(refreshBankAccount("1", "akahu")).rejects.toThrow("Account not found");
  });
});

describe("fetchBankSyncUpgradePrompt", () => {
  it("is true only for an explicit showPopup", async () => {
    get.mockResolvedValueOnce({ data: { showPopup: true } });
    expect(await fetchBankSyncUpgradePrompt()).toBe(true);
    get.mockResolvedValueOnce({ data: { showPopup: "yes" } });
    expect(await fetchBankSyncUpgradePrompt()).toBe(false);
    get.mockResolvedValueOnce({ data: {} });
    expect(await fetchBankSyncUpgradePrompt()).toBe(false);
    expect(get).toHaveBeenCalledWith(apiRoutes.bankConnection.fiskilPopUp);
  });
});

describe("bankLabels", () => {
  it("numbers accounts by id, whatever order they load in", () => {
    const labels = bankLabels([{ id: "6418" }, { id: "6351" }, { id: "6381" }]);
    expect(labels.get("6351")).toBe("Bank 1");
    expect(labels.get("6381")).toBe("Bank 2");
    expect(labels.get("6418")).toBe("Bank 3");
  });
});

describe("accountForTransaction", () => {
  const accounts = [
    mapBankAccount({ id: 1, bank_name: "Business Transaction Account" }),
    mapBankAccount({ id: 2, bank_name: "Full-time Employee Account" }),
  ];

  it("finds the account by id, then by name", () => {
    expect(accountForTransaction(accounts, { bankAccountId: "2" })?.id).toBe("2");
    expect(
      accountForTransaction(accounts, { bankAccountId: "99", bankName: " business transaction account " })?.id,
    ).toBe("1");
    expect(accountForTransaction(accounts, { bankName: "Elsewhere" })).toBeUndefined();
  });
});
