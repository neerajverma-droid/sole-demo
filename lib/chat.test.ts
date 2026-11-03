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

// Imported after the mock so `lib/chat.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  endAgentChat,
  fetchChatHistory,
  fetchChatUnreadCount,
  formatChatTime,
  generateId,
  getChatContext,
  getPdfPreviewUrl,
  isPdfAttachment,
  markChatRead,
  sendAgentMessage,
  sendAssistantMessage,
  uploadChatAttachment,
} = await import("@/lib/chat");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateId", () => {
  it("is never the same value twice", () => {
    expect(generateId()).not.toBe(generateId());
  });

  it("is prefixed, so it never collides with a history row's `hist_<id>`", () => {
    expect(generateId()).toMatch(/^msg_\d+_[a-z0-9]+$/);
  });
});

describe("formatChatTime", () => {
  it("formats a real ISO timestamp", () => {
    expect(formatChatTime("2026-01-15T03:04:00.000Z")).toMatch(/\d/);
  });

  it("is blank for an invalid timestamp rather than throwing", () => {
    expect(formatChatTime("not a date")).toBe("");
  });
});

describe("getChatContext", () => {
  it("maps a known first path segment to its module label", () => {
    vi.stubGlobal("window", { location: { pathname: "/invoices/123" } });
    expect(getChatContext()).toEqual({ page: "/invoices/123", module: "Invoices" });
  });

  it("title-cases an unrecognised segment rather than dropping it", () => {
    vi.stubGlobal("window", { location: { pathname: "/asset-register" } });
    expect(getChatContext().module).toBe("Asset Register");
  });

  it("defaults to Dashboard for the root path", () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    expect(getChatContext()).toEqual({ page: "/", module: "Dashboard" });
  });

  it("is null/null when there's no window at all (server-rendered)", () => {
    vi.stubGlobal("window", undefined);
    expect(getChatContext()).toEqual({ page: null, module: null });
  });
});

describe("getPdfPreviewUrl / isPdfAttachment", () => {
  it("appends the hide-toolbar params with ? when the url has no fragment yet", () => {
    expect(getPdfPreviewUrl("https://cdn.test/file.pdf")).toBe(
      "https://cdn.test/file.pdf#toolbar=0&navpanes=0&scrollbar=0",
    );
  });

  it("appends with & when the url already has a fragment", () => {
    expect(getPdfPreviewUrl("https://cdn.test/file.pdf#page=2")).toBe(
      "https://cdn.test/file.pdf#page=2&toolbar=0&navpanes=0&scrollbar=0",
    );
  });

  it("is blank for no url", () => {
    expect(getPdfPreviewUrl(null)).toBe("");
  });

  it("detects a pdf by mediaType first, then by file extension", () => {
    expect(isPdfAttachment({ mediaType: "pdf", mediaUrl: "https://cdn.test/x" })).toBe(true);
    expect(isPdfAttachment({ mediaType: "image", mediaUrl: "https://cdn.test/x.pdf?v=1" })).toBe(
      true,
    );
    expect(isPdfAttachment({ mediaType: "image", mediaUrl: "https://cdn.test/x.png" })).toBe(
      false,
    );
  });
});

describe("fetchChatHistory", () => {
  it("maps sender types to display roles and reports hasMore", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          messages: [
            { id: 1, senderType: "user", content: "Hi", timestamp: "2026-01-01T00:00:00.000Z" },
            { id: 2, senderType: "bot", content: "Hello", timestamp: "2026-01-01T00:00:01.000Z" },
            { id: 3, senderType: "agent", content: "I'm here", timestamp: "2026-01-01T00:00:02.000Z" },
          ],
          pagination: { hasNextPage: true },
        },
      },
    });

    const result = await fetchChatHistory(1, 10);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.chatbot.history, {
      params: { page: 1, limit: 10 },
    });
    expect(result.hasMore).toBe(true);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "bot", "agent"]);
    expect(result.messages.map((m) => m.id)).toEqual(["hist_1", "hist_2", "hist_3"]);
  });

  it("drops a 'system' row entirely, the way sole-webapp's own history fetch does — it's never shown as a stale notice on reload", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          messages: [
            { id: 1, senderType: "bot", content: "Hello" },
            { id: 2, senderType: "system", content: "You're now with a support agent" },
          ],
          pagination: {},
        },
      },
    });

    const result = await fetchChatHistory(1, 10);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("bot");
  });

  it("drops a row with neither content nor a media url", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { messages: [{ id: 1, senderType: "bot", content: "" }], pagination: {} },
      },
    });
    expect((await fetchChatHistory(1, 10)).messages).toHaveLength(0);
  });

  it("filters out internal routing-marker texts", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          messages: [
            { id: 1, senderType: "bot", content: "[forwarded_to_agent]" },
            { id: 2, senderType: "bot", content: "Real reply" },
          ],
          pagination: {},
        },
      },
    });

    const result = await fetchChatHistory(1, 10);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe("Real reply");
  });

  it("defaults to an empty page when the response has none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchChatHistory(1, 10)).toEqual({ messages: [], hasMore: false });
  });
});

describe("fetchChatUnreadCount", () => {
  it("reads the unread figure", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { unread: 3 } } });
    expect(await fetchChatUnreadCount()).toBe(3);
  });

  it("defaults to 0 with no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchChatUnreadCount()).toBe(0);
  });
});

describe("markChatRead", () => {
  it("posts the current page/module context", async () => {
    vi.stubGlobal("window", { location: { pathname: "/quotes" } });
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await markChatRead();

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.chatbot.markRead, {
      page: "/quotes",
      module: "Quotes",
    });
  });

  it("never throws — a missed read-receipt isn't worth surfacing", async () => {
    apiMock.post.mockRejectedValue(new Error("network down"));
    await expect(markChatRead()).resolves.toBeUndefined();
  });
});

describe("sendAssistantMessage", () => {
  // This endpoint's response is NOT the usual `{success, data: {...}}`
  // envelope — `messages`/`handoff` sit directly on the body. Reading it as
  // `response.data.data?.messages` (every other call's shape) silently
  // resolved to `undefined` on every real reply, which is why a typed
  // message never showed up after the very first (client-side) greeting.
  it("reads `messages` off the top level of the response, not nested under `data`", async () => {
    vi.stubGlobal("window", { location: { pathname: "/expenses" } });
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        messages: [
          {
            text: "Sure thing",
            timestamp: "2026-01-01T00:00:00.000Z",
            mediaType: "text",
            mediaUrl: null,
            buttons: [],
          },
        ],
        handoff: { active: false },
      },
    });

    const reply = await sendAssistantMessage("How do I log an expense?");

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.chatbot.assistant, {
      input: "How do I log an expense?",
      page: "/expenses",
      module: "Expenses",
    });
    expect(reply).toEqual({
      text: "Sure thing",
      timestamp: "2026-01-01T00:00:00.000Z",
      mediaType: "text",
      mediaUrl: null,
      buttons: [],
    });
  });

  it("carries quick-reply buttons through, defaulting to none when the server omits them", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        messages: [
          {
            text: "Welcome",
            timestamp: "2026-01-01T00:00:00.000Z",
            buttons: [{ text: "Create Expense", payload: "create_expense" }],
          },
        ],
      },
    });
    const reply = await sendAssistantMessage("hi");
    expect(reply?.buttons).toEqual([{ text: "Create Expense", payload: "create_expense" }]);

    apiMock.post.mockResolvedValue({
      data: { success: true, messages: [{ text: "No buttons here", timestamp: "2026-01-01T00:00:00.000Z" }] },
    });
    expect((await sendAssistantMessage("hi"))?.buttons).toEqual([]);
  });

  it("is null when the bot has nothing to say — a human has the conversation", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, messages: [] } });
    expect(await sendAssistantMessage("hi")).toBeNull();
  });

  it("throws when the success envelope is missing the messages array entirely", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(sendAssistantMessage("hi")).rejects.toThrow(
      "Something went wrong. Please try again.",
    );
  });

  it("throws the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Rate limited." } });
    await expect(sendAssistantMessage("hi")).rejects.toThrow("Rate limited.");
  });
});

describe("uploadChatAttachment", () => {
  it("posts multipart form data and resolves the uploaded file's details", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { url: "https://cdn.test/a.png", contentType: "image/png" } },
    });
    const file = new File(["x"], "photo.png", { type: "image/png" });

    const result = await uploadChatAttachment(file);

    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.chatbot.upload,
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    expect(result).toMatchObject({ url: "https://cdn.test/a.png", contentType: "image/png", name: "photo.png" });
  });

  it("throws when the upload didn't come back with a url", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Too large." } });
    const file = new File(["x"], "photo.png", { type: "image/png" });
    await expect(uploadChatAttachment(file)).rejects.toThrow("Too large.");
  });
});

describe("sendAgentMessage", () => {
  it("posts the message plus context, scoped to the active agent conversation", async () => {
    vi.stubGlobal("window", { location: { pathname: "/invoices" } });
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { id: 9, content: "On it", timestamp: "2026-01-01T00:00:00.000Z" },
      },
    });

    const message = await sendAgentMessage({ text: "On it" });

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.chatbot.agentMessage, {
      text: "On it",
      page: "/invoices",
      module: "Invoices",
    });
    expect(message).toMatchObject({ role: "user", text: "On it", serverId: 9 });
  });

  it("throws the server's own message on failure (e.g. the conversation isn't agent-active)", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Not currently with an agent." } });
    await expect(sendAgentMessage({ text: "hi" })).rejects.toThrow(
      "Not currently with an agent.",
    );
  });
});

describe("endAgentChat", () => {
  it("posts with no body — the user is identified from auth", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await endAgentChat();
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.chatbot.endAgentChat, {});
  });
});
