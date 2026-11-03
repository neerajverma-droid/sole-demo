import { describe, expect, it } from "vitest";

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
      date: "2026-10-01T00:00:00.000Z",
      read: false,
    });
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
      date: "",
      read,
    });
    expect(
      unreadCount([row("1", false), row("2", true), row("3", false)]),
    ).toBe(2);
  });
});
