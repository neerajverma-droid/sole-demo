import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Sole",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="8 August 2026"
      intro="How Sole collects, uses and protects the information you give us when you run your business through the platform."
      sections={[
        {
          heading: "What we collect",
          body: "Account details, the business information you enter, and the financial records you import or connect — including bank feed data where you authorise it.",
        },
        {
          heading: "How we use it",
          body: "To run the service: preparing your invoices, matching transactions, calculating GST and producing the reports you ask for. We don't sell your data.",
        },
        {
          heading: "Bank connections",
          body: "Bank feeds are read-only and are established through an accredited data provider. You can disconnect an account at any time from Settings.",
        },
        {
          heading: "Retention and access",
          body: "Australian tax law requires most records to be kept for five years. You can export or request deletion of your data, subject to those obligations.",
        },
      ]}
    />
  );
}
