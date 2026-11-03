import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms and Conditions · Sole",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      updated="8 August 2026"
      intro="The agreement between you and Sole for use of the platform."
      sections={[
        {
          heading: "Your account",
          body: "You're responsible for the accuracy of the information you enter and for keeping your sign-in details secure.",
        },
        {
          heading: "The service",
          body: "Sole is bookkeeping software. It isn't financial, tax or legal advice, and it doesn't replace your accountant's judgement.",
        },
        {
          heading: "Subscription and billing",
          body: "Plans renew automatically until cancelled. You can change or cancel your plan from Settings, effective at the end of the current period.",
        },
        {
          heading: "Availability",
          body: "We aim to keep the service running continuously, with planned maintenance announced in advance where practical.",
        },
      ]}
    />
  );
}
