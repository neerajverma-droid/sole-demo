import type { Metadata } from "next";

import { FiskilRedirectPage } from "@/components/banking/fiskil-redirect-page";

export const metadata: Metadata = {
  title: "Bank connected · Sole",
};

export default function FiskilSuccessPage() {
  return (
    <FiskilRedirectPage
      tone="success"
      title="Bank connection complete"
      description="Your accounts will appear shortly — it can take a few minutes for the first sync to finish."
    />
  );
}
