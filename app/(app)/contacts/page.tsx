import type { Metadata } from "next";
import { Suspense } from "react";

import { ContactsScreen } from "@/components/contacts/contacts-screen";

export const metadata: Metadata = {
  title: "Contacts · Sole",
};

export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsScreen />
    </Suspense>
  );
}
