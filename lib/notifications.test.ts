import { describe, expect, it, vi } from "vitest";

import { mapNotification, unreadCount } from "@/lib/notifications";

describe("mapNotification", () => {
  it("normalises the server's stringly-typed row", () => {
    expect(
      mapNotification({
        notification_id: 7,
        title: " Invoice overdue ",
        message: null,
        notification_date: "2026-10-01T00:00:00.000Z",
        is_read: "0",
      }),
    ).toEqual({
      id: "7",
      title: "Invoice overdue",
      message: "",
      link: null,
      date: "2026-10-01T00:00:00.000Z",
      read: false,
    });
  });

  it("keeps a link only when it's a path in this app", () => {
    const link = (value: string | null) => mapNotification({ notification_id: 1, link: value }).link;
    expect(link("/proposals/12?comments=4")).toBe("/proposals/12?comments=4");
    expect(link(" /proposals/12 ")).toBe("/proposals/12");
    expect(link("https://evil.example/phish")).toBeNull();
    expect(link("//evil.example")).toBeNull();
    expect(link("/\\evil.example")).toBeNull();
    expect(link("javascript:alert(1)")).toBeNull();
    expect(link("")).toBeNull();
    expect(link(null)).toBeNull();
  });

  it("reads '1' / 1 / true as read and everything else as unread", () => {
    const read = (is_read: string | number | boolean | null) =>
      mapNotification({ notification_id: 1, is_read }).read;
    expect(read("1")).toBe(true);
    expect(read(1)).toBe(true);
    expect(read(true)).toBe(true);
    expect(read("0")).toBe(false);
    expect(read(null)).toBe(false);
  });
});

describe("unreadCount", () => {
  it("is zero for an empty feed — a new account has nothing to flag", () => {
    expect(unreadCount([])).toBe(0);
  });

  it("counts only unread rows", () => {
    const row = (id: string, read: boolean) => ({
      id,
      title: "",
      message: "",
      link: null,
      date: "",
      read,
    });
    expect(
      unreadCount([row("1", false), row("2", true), row("3", false)]),
    ).toBe(2);
  });
});

describe("markNotificationRead", () => {
  it("PATCHes that one notification's read route", async () => {
    const { default: api } = await import("@/utils/axiosInstance");
    const { default: apiRoutes } = await import("@/config/api-routes");
    const { markNotificationRead } = await import("@/lib/notifications");
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { success: true } });
    await markNotificationRead("42");
    expect(patch).toHaveBeenCalledWith(apiRoutes.user.notificationRead("42"));
    patch.mockResolvedValue({ data: { success: false, message: "Notification not found" } });
    await expect(markNotificationRead("99")).rejects.toThrow("Notification not found");
    patch.mockRestore();
  });
});
