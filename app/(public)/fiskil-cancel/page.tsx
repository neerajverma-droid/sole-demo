import type { Metadata } from "next";

import { FiskilRedirectPage } from "@/components/banking/fiskil-redirect-page";

export const metadata: Metadata = {
  title: "Connection cancelled · Sole",
};

export default function FiskilCancelPage() {
  return (
    <FiskilRedirectPage
      tone="cancel"
      title="Connection cancelled"
      description="No bank account was connected. You can try again any time from Connected accounts."
    />
  );
}
