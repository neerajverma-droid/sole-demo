import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { post: vi.fn(), get: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { undoAssetMatchMutationOptions } = await import("@/hooks/use-asset-match-query");

beforeEach(() => vi.clearAllMocks());

describe("undoAssetMatchMutationOptions", () => {
  it("resolves when the server answers, without waiting for the register to reload", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const client = new QueryClient();
    // A refetch that never finishes: the register is slow, or the network is.
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockReturnValue(new Promise(() => {}));

    const mutation = client
      .getMutationCache()
      .build(client, undoAssetMatchMutationOptions(client));

    await expect(mutation.execute("42")).resolves.toBeUndefined();
    expect(apiMock.post.mock.calls[0][1]).toEqual({ asset_id: "42" });
    // Both the list and the one asset are still marked stale, in the background.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["asset", "42"] });
  });

  it("rejects, and refreshes nothing, when the undo is refused", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "nope" } });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const mutation = client
      .getMutationCache()
      .build(client, undoAssetMatchMutationOptions(client));

    await expect(mutation.execute("42")).rejects.toThrow("nope");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
