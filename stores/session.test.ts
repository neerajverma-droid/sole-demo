import { beforeEach, describe, expect, it } from "vitest";

import {
  currentUserId,
  sessionUserId,
  useSessionStore,
} from "@/stores/session";

/**
 * The id eight call sites depend on.
 *
 * Each used to spell this out itself, and two got it wrong in ways that
 * type-checked: the invoice editor read only `id` (a field the profile never
 * carries, so it resolved null on every render), and the admin-access query
 * keyed its cache on `user?.id ?? null` — a constant, which gave two different
 * admins on one browser a single shared grant list.
 */
describe("sessionUserId", () => {
  it("reads user_id, which is what the profile actually returns", () => {
    expect(sessionUserId({ user_id: 42 })).toBe("42");
  });

  it("falls back to id for anything that still sends it", () => {
    expect(sessionUserId({ id: 7 })).toBe("7");
  });

  it("prefers user_id when a payload carries both", () => {
    expect(sessionUserId({ user_id: 42, id: 7 })).toBe("42");
  });

  it("always returns a string, so a number and a numeric string key alike", () => {
    // These two must produce the same React Query cache key, or the same user
    // gets two cache entries depending on which endpoint last wrote the store.
    expect(sessionUserId({ user_id: 42 })).toBe(sessionUserId({ user_id: "42" }));
  });

  it.each([
    ["no user", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["an empty-string id", { user_id: "" }],
  ])("is null for %s rather than a falsy id", (_label, user) => {
    // Null and not "" — a cache key of "" would still collide across users,
    // which is the bug this helper exists to stop.
    expect(sessionUserId(user)).toBeNull();
  });

  it("treats 0 as a real id", () => {
    // `??` rather than `||`: a user_id of 0 is unlikely but it is a value, and
    // dropping it would be the same silent-null failure all over again.
    expect(sessionUserId({ user_id: 0 })).toBe("0");
  });
});

describe("currentUserId", () => {
  beforeEach(() => {
    /*
     * Written through `setState` rather than `setUser` so the persist
     * middleware has nothing to flush — this suite runs under the project's
     * plain "node" environment, where there is no localStorage and every
     * persisted write logs "the given storage is currently unavailable".
     * Reading is what's under test here; persistence isn't.
     */
    useSessionStore.setState({ user: null });
  });

  it("is null while nobody is signed in", () => {
    expect(currentUserId()).toBeNull();
  });

  it("reads whatever SessionProvider last mirrored in", () => {
    useSessionStore.setState({ user: { user_id: 99, email: "a@b.com" } });
    expect(currentUserId()).toBe("99");
  });

  it("goes back to null once the session is cleared", () => {
    useSessionStore.setState({ user: { user_id: 99 } });
    useSessionStore.setState({ user: null });
    expect(currentUserId()).toBeNull();
  });
});
