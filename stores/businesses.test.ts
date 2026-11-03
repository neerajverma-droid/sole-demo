import { beforeEach, describe, expect, it, vi } from "vitest";

// `persist` writes through to storage on every `set()` — stubbed so the
// store's own actions can run under the plain "node" test environment,
// which has no real `localStorage`. `skipHydration` means nothing ever
// reads from it, so a no-op write is all this needs.
vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

const businessesApiMock = {
  setBusinessDefaultApi: vi.fn(),
  deleteBusinessApi: vi.fn(),
};

vi.mock("@/lib/businesses", () => businessesApiMock);

const setBusinessIdMock = vi.fn();
/**
 * `getBusinessId` is mocked alongside the setter because `setBusinesses` now
 * reads it: the store's `activeId` and the id every request is stamped with
 * have to start from the same place. Returns null by default — "nothing stored
 * yet", the state a fresh browser is in — and individual tests override it.
 */
const getBusinessIdMock = vi.fn((): string | null => null);
vi.mock("@/utils/businessStorage", () => ({
  getBusinessId: getBusinessIdMock,
  setBusinessId: setBusinessIdMock,
}));

// Imported after the mocks so the store's own imports resolve to them.
const { useBusinessesStore, activeBusiness } = await import("@/stores/businesses");

import type { BusinessProfile } from "@/lib/businesses";

function baseBusiness(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: "b1",
    name: "Turner Consulting",
    email: "",
    abn: "",
    paid: true,
    tone: 0,
    logo: null,
    subscription: null,
    industryId: null,
    ndisNumber: "",
    accountingType: "",
    companyType: "",
    bank: { bsb: "", accountNumber: "", accountHolder: "", bankName: "" },
    address: { line1: "", city: "", state: "", postcode: "", country: "" },
    countryIso2: "AU",
    countryCode: "",
    mobile: "",
    firstName: "",
    middleName: "",
    lastName: "",
    companyName: "",
    documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBusinessesStore.setState({
    businesses: [],
    activeId: "",
    defaultId: "",
    hydrated: false,
  });
});

describe("setBusinesses", () => {
  it("keeps the currently open business if it's still in the fresh list and still paid", () => {
    useBusinessesStore.setState({ activeId: "b2" });
    const businesses = [baseBusiness({ id: "b1" }), baseBusiness({ id: "b2" })];

    useBusinessesStore.getState().setBusinesses(businesses, "b1");

    expect(useBusinessesStore.getState().activeId).toBe("b2");
    expect(useBusinessesStore.getState().hydrated).toBe(true);
  });

  it("falls back to the account's default when the previously-open business is gone from the fresh list", () => {
    useBusinessesStore.setState({ activeId: "stale-id" });
    const businesses = [baseBusiness({ id: "b1" })];

    useBusinessesStore.getState().setBusinesses(businesses, "b1");

    expect(useBusinessesStore.getState().activeId).toBe("b1");
  });

  it("falls back to the default when the previously-open business has since been locked (unpaid)", () => {
    useBusinessesStore.setState({ activeId: "b1" });
    const businesses = [baseBusiness({ id: "b1", paid: false }), baseBusiness({ id: "b2" })];

    useBusinessesStore.getState().setBusinesses(businesses, "b2");

    expect(useBusinessesStore.getState().activeId).toBe("b2");
  });

  it("defaults defaultId to '' when the API gives none", () => {
    useBusinessesStore.getState().setBusinesses([baseBusiness()], null);
    expect(useBusinessesStore.getState().defaultId).toBe("");
  });
});

describe("select", () => {
  it("opens a real, paid business and tells the axios client which one", () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1", paid: true })] });

    useBusinessesStore.getState().select("b1");

    expect(useBusinessesStore.getState().activeId).toBe("b1");
    expect(setBusinessIdMock).toHaveBeenCalledWith("b1");
  });

  it("is a no-op for an id that isn't in the list", () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1" })], activeId: "b1" });

    useBusinessesStore.getState().select("does-not-exist");

    expect(useBusinessesStore.getState().activeId).toBe("b1");
    expect(setBusinessIdMock).not.toHaveBeenCalled();
  });

  it("is a no-op for a business that's still locked (unpaid)", () => {
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", paid: false })],
      activeId: "",
    });

    useBusinessesStore.getState().select("b1");

    expect(useBusinessesStore.getState().activeId).toBe("");
    expect(setBusinessIdMock).not.toHaveBeenCalled();
  });
});

describe("setDefault", () => {
  it("calls the real API and updates defaultId only for a real, paid business", async () => {
    businessesApiMock.setBusinessDefaultApi.mockResolvedValue(undefined);
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1", paid: true })] });

    await useBusinessesStore.getState().setDefault("b1");

    expect(businessesApiMock.setBusinessDefaultApi).toHaveBeenCalledWith("b1");
    expect(useBusinessesStore.getState().defaultId).toBe("b1");
  });

  it("never calls the API for an unpaid or unknown business", async () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1", paid: false })] });

    await useBusinessesStore.getState().setDefault("b1");
    await useBusinessesStore.getState().setDefault("unknown");

    expect(businessesApiMock.setBusinessDefaultApi).not.toHaveBeenCalled();
  });
});

describe("removeBusiness", () => {
  it("removes a real, unpaid, non-default business via the real API", async () => {
    businessesApiMock.deleteBusinessApi.mockResolvedValue(undefined);
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", paid: false })],
      defaultId: "other",
      activeId: "",
    });

    await useBusinessesStore.getState().removeBusiness("b1");

    expect(businessesApiMock.deleteBusinessApi).toHaveBeenCalledWith("b1");
    expect(useBusinessesStore.getState().businesses).toEqual([]);
  });

  it("refuses to remove a paid business", async () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1", paid: true })] });

    await useBusinessesStore.getState().removeBusiness("b1");

    expect(businessesApiMock.deleteBusinessApi).not.toHaveBeenCalled();
    expect(useBusinessesStore.getState().businesses).toHaveLength(1);
  });

  it("refuses to remove the account's default business, even if unpaid", async () => {
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", paid: false })],
      defaultId: "b1",
    });

    await useBusinessesStore.getState().removeBusiness("b1");

    expect(businessesApiMock.deleteBusinessApi).not.toHaveBeenCalled();
    expect(useBusinessesStore.getState().businesses).toHaveLength(1);
  });

  it("falls back the active selection to the default when the removed business was somehow the open one", async () => {
    businessesApiMock.deleteBusinessApi.mockResolvedValue(undefined);
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", paid: false })],
      activeId: "b1",
      defaultId: "b2",
    });

    await useBusinessesStore.getState().removeBusiness("b1");

    expect(useBusinessesStore.getState().activeId).toBe("b2");
  });
});

describe("renameBusiness", () => {
  it("renames only the matching business, trimmed", () => {
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", name: "Old" }), baseBusiness({ id: "b2", name: "Keep" })],
    });

    useBusinessesStore.getState().renameBusiness("b1", "  New Name  ");

    const [b1, b2] = useBusinessesStore.getState().businesses;
    expect(b1.name).toBe("New Name");
    expect(b2.name).toBe("Keep");
  });

  it("is a no-op on a blank name", () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1", name: "Original" })] });

    useBusinessesStore.getState().renameBusiness("b1", "   ");

    expect(useBusinessesStore.getState().businesses[0].name).toBe("Original");
  });
});

describe("addBusiness", () => {
  it("appends a new, unpaid, blank profile and returns it", () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1" })] });

    const created = useBusinessesStore.getState().addBusiness("  New Co  ");

    expect(created.name).toBe("New Co");
    expect(created.paid).toBe(false);
    expect(created.tone).toBe(1);
    expect(useBusinessesStore.getState().businesses).toHaveLength(2);
    expect(useBusinessesStore.getState().businesses[1]).toBe(created);
  });
});

describe("setSubscription", () => {
  it("updates only the matching business's subscription, without touching activeId or paid", () => {
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1", paid: true })],
      activeId: "",
    });

    useBusinessesStore.getState().setSubscription("b1", { plan: "starter" } as never);

    const [business] = useBusinessesStore.getState().businesses;
    expect(business.subscription).toEqual({ plan: "starter" });
    expect(useBusinessesStore.getState().activeId).toBe("");
  });

  it("is a no-op for an unknown id", () => {
    useBusinessesStore.setState({ businesses: [baseBusiness({ id: "b1" })] });

    useBusinessesStore.getState().setSubscription("unknown", { plan: "starter" } as never);

    expect(useBusinessesStore.getState().businesses[0].subscription).toBeNull();
  });
});

describe("activeBusiness — the resolved open business", () => {
  it("is the business matching activeId", () => {
    const businesses = [baseBusiness({ id: "b1" }), baseBusiness({ id: "b2" })];
    expect(activeBusiness({ businesses, activeId: "b2" })?.id).toBe("b2");
  });

  it("falls back to the first paid business when activeId matches nothing", () => {
    const businesses = [
      baseBusiness({ id: "b1", paid: false }),
      baseBusiness({ id: "b2", paid: true }),
    ];
    expect(activeBusiness({ businesses, activeId: "" })?.id).toBe("b2");
  });

  it("falls back to the first business of any kind when none are paid", () => {
    const businesses = [baseBusiness({ id: "b1", paid: false })];
    expect(activeBusiness({ businesses, activeId: "" })?.id).toBe("b1");
  });

  it("is null for an empty list", () => {
    expect(activeBusiness({ businesses: [], activeId: "" })).toBeNull();
  });
});
