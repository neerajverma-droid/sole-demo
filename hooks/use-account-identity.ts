"use client";

import { useSession } from "@/components/auth/session-provider";

const FALLBACK_USER = { name: "Your account", email: "", initials: "" };

/**
 * The signed-in person as the chrome shows them — a display name, their email
 * and up to two initials for the avatar. Shared by the rail's account menu and
 * the top bar's profile menu, so the two can't disagree about who you are.
 */
export function useAccountIdentity() {
  const { user } = useSession();
  if (!user) return FALLBACK_USER;

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.business_name ||
    user.email ||
    FALLBACK_USER.name;

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    (user.email?.[0]?.toUpperCase() ?? "");

  return { name, email: user.email ?? "", initials };
}
