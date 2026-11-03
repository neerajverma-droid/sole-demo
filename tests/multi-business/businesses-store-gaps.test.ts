import { beforeEach, describe, expect, it, vi } from "vitest";

// `persist` writes through to storage on every `set()` — stubbed so the
// store's own actions can run under the plain "node" test environment.
vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

vi.mock("@/lib/businesses", () => ({
  setBusinessDefaultApi: vi.fn(),
  deleteBusinessApi: vi.fn(),
}));

const setBusinessIdMock = vi.fn();
const getBusinessIdMock = vi.fn((): string | null => null);
vi.mock("@/utils/businessStorage", () => ({
  getBusinessId: getBusinessIdMock,
  setBusinessId: setBusinessIdMock,
}));

// Imported after the mocks so the store's own imports resolve to them.
const { useBusinessesStore } = await import("@/stores/businesses");

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
  getBusinessIdMock.mockReturnValue(null);
  useBusinessesStore.setState({
    businesses: [],
    activeId: "",
    defaultId: "",
    hydrated: false,
  });
});

describe("setBusinesses — keeping the store and the request header in step", () => {
  it("adopts the id already in business storage when the store has no activeId yet", () => {
    getBusinessIdMock.mockReturnValue("b2");
    useBusinessesStore
      .getState()
      .setBusinesses([baseBusiness({ id: "b1" }), baseBusiness({ id: "b2" })], "b1");

    expect(useBusinessesStore.getState().activeId).toBe("b2");
    // Already what storage holds — nothing to write.
    expect(setBusinessIdMock).not.toHaveBeenCalled();
  });

  it("prefers the store's own activeId over what storage holds", () => {
    getBusinessIdMock.mockReturnValue("b2");
    useBusinessesStore.setState({ activeId: "b3" });
    useBusinessesStore
      .getState()
      .setBusinesses(
        [baseBusiness({ id: "b1" }), baseBusiness({ id: "b2" }), baseBusiness({ id: "b3" })],
        "b1",
      );

    expect(useBusinessesStore.getState().activeId).toBe("b3");
    expect(setBusinessIdMock).toHaveBeenCalledWith("b3");
  });

  it("writes the fallback default through to storage when the stored id is no longer valid", () => {
    getBusinessIdMock.mockReturnValue("gone");
    useBusinessesStore.getState().setBusinesses([baseBusiness({ id: "b1" })], "b1");

    expect(useBusinessesStore.getState().activeId).toBe("b1");
    expect(setBusinessIdMock).toHaveBeenCalledWith("b1");
  });

  it("writes nothing when there's no valid business and no default to fall back to", () => {
    useBusinessesStore.getState().setBusinesses([], null);

    expect(useBusinessesStore.getState().activeId).toBe("");
    expect(useBusinessesStore.getState().hydrated).toBe(true);
    expect(setBusinessIdMock).not.toHaveBeenCalled();
  });
});

describe("patchBusiness", () => {
  it("merges the given fields into the matching business only", () => {
    useBusinessesStore.setState({
      businesses: [baseBusiness({ id: "b1" }), baseBusiness({ id: "b2" })],
    });
    useBusinessesStore.getState().patchBusiness("b2", { email: "new@example.com", abn: "1" });

    const [first, second] = useBusinessesStore.getState().businesses;
    expect(first.email).toBe("");
    expect(second).toMatchObject({ id: "b2", email: "new@example.com", abn: "1" });
    expect(second.name).toBe("Turner Consulting");
  });

  it("is a no-op for an unknown id", () => {
    const businesses = [baseBusiness({ id: "b1" })];
    useBusinessesStore.setState({ businesses });
    useBusinessesStore.getState().patchBusiness("missing", { name: "X" });
    expect(useBusinessesStore.getState().businesses).toEqual(businesses);
  });
});
