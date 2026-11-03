import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// `stores/session.ts` uses zustand's `persist`, which writes through to storage
// on every `set()` — this repo's plain "node" environment has no localStorage.
vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

const { useSessionStore } = await import("@/stores/session");
const { startBankConnection, completeAkahuConnection } = await import("@/lib/bank-connection");

const AUTH_URL = "https://auth.fiskil.com/flow/abc123";

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: null });
});

describe("startBankConnection", () => {
  it("GETs /bank/connect with userId/email/name read off the session's raw field names", async () => {
    useSessionStore.setState({
      user: { user_id: 42, email: "jo@example.com", full_name: "Jo Bloggs", name: "ignored" },
    });
    apiMock.get.mockResolvedValue({ data: { success: true, data: { authUrl: AUTH_URL } } });

    await startBankConnection();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankConnection.connect, {
      params: { userId: "42", email: "jo@example.com", name: "Jo Bloggs" },
    });
  });

  it("returns Fiskil's hosted-flow authUrl", async () => {
    useSessionStore.setState({ user: { user_id: 1 } });
    apiMock.get.mockResolvedValue({ data: { success: true, data: { authUrl: AUTH_URL } } });
    await expect(startBankConnection()).resolves.toBe(AUTH_URL);
  });

  it("falls back to `id` when the profile has no user_id", async () => {
    useSessionStore.setState({ user: { id: 7, email: "a@b.co", full_name: "A B" } });
    apiMock.get.mockResolvedValue({ data: { data: { authUrl: AUTH_URL } } });
    await startBankConnection();
    expect(apiMock.get.mock.calls[0][1].params.userId).toBe("7");
  });

  it("uses full_name, never `name`, and sends undefined for fields the profile doesn't carry", async () => {
    useSessionStore.setState({ user: { user_id: 5, name: "Display Name" } });
    apiMock.get.mockResolvedValue({ data: { data: { authUrl: AUTH_URL } } });
    await startBankConnection();
    expect(apiMock.get.mock.calls[0][1].params).toEqual({
      userId: "5",
      email: undefined,
      name: undefined,
    });
  });

  it("throws before any request when no one is signed in", async () => {
    await expect(startBankConnection()).rejects.toThrow(
      "Sign in again before connecting a bank account.",
    );
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("throws before any request when the user has no usable id", async () => {
    useSessionStore.setState({ user: { user_id: "", email: "a@b.co" } });
    await expect(startBankConnection()).rejects.toThrow("Sign in again");
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it.each([
    ["missing authUrl", { data: { success: true, data: {} } }],
    ["no data at all", { data: {} }],
    ["an http:// authUrl", { data: { data: { authUrl: "http://auth.fiskil.com/x" } } }],
    ["a relative authUrl", { data: { data: { authUrl: "/fiskil-success" } } }],
    ["a javascript: URL", { data: { data: { authUrl: "javascript:alert(1)" } } }],
  ])("throws a retry message for %s", async (_label, response) => {
    useSessionStore.setState({ user: { user_id: 1 } });
    apiMock.get.mockResolvedValue(response);
    await expect(startBankConnection()).rejects.toThrow(
      "Couldn't start the bank connection. Try again.",
    );
  });
});

describe("startBankConnection for Akahu (NZ)", () => {
  const AKAHU_URL = "https://oauth.akahu.nz/?response_type=code&state=abc";

  it("POSTs /bank/akahu/connect with only the email — the server takes the user from the session", async () => {
    useSessionStore.setState({ user: { user_id: 42, email: "kiri@example.nz", full_name: "Kiri" } });
    apiMock.post.mockResolvedValue({ data: { success: true, data: { authUrl: AKAHU_URL } } });

    await expect(startBankConnection("akahu")).resolves.toBe(AKAHU_URL);

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.connect, {
      email: "kiri@example.nz",
    });
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("refuses a non-https link the same way Fiskil's is refused", async () => {
    useSessionStore.setState({ user: { user_id: 1 } });
    apiMock.post.mockResolvedValue({ data: { data: { authUrl: "http://oauth.akahu.nz" } } });
    await expect(startBankConnection("akahu")).rejects.toThrow("Couldn't start the bank connection");
  });
});

describe("completeAkahuConnection", () => {
  it("posts what Akahu put on the redirect", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { success: true, accounts: 2 } } });

    await expect(completeAkahuConnection({ code: "c0de", state: "st4te", error: null })).resolves.toBe("connected");

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.bankConnection.akahu.callback, {
      code: "c0de",
      state: "st4te",
      error: undefined,
    });
  });

  it("reports a declined consent as cancelled", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { cancelled: true } } });
    await expect(completeAkahuConnection({ code: null, state: "st4te", error: "access_denied" })).resolves.toBe("cancelled");
  });

  it("throws without a state, before any request", async () => {
    await expect(completeAkahuConnection({ code: "c0de", state: null, error: null })).rejects.toThrow(/Start the connection again/);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("throws the server's message on a failure body", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "This bank connection request wasn't found." } });
    await expect(completeAkahuConnection({ code: "c", state: "s", error: null })).rejects.toThrow("wasn't found");
  });
});
