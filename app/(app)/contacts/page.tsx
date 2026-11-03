import { Suspense } from "react";

import { ContactsScreen } from "@/components/contacts/contacts-screen";

export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsScreen />
    </Suspense>
  );
}
