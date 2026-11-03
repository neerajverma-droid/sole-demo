"use client";

import { AccountantAccessCard } from "@/components/settings/account-sharing/accountant-access-card";
import { SpmConnectCard } from "@/components/settings/account-sharing/spm-connect-card";

/**
 * Account Sharing — who else can see this account's books, and how.
 *
 * Two ways in, kept as separate cards because they're different trust
 * models: a named, permission-scoped invite (Access Details) versus a shared
 * secret an accountant's own Sole SPM portal uses to connect directly.
 */
export function AccountSharingSection() {
  return (
    <div className="space-y-[15px]">
      <AccountantAccessCard />
      <SpmConnectCard />
    </div>
  );
}
