import { Suspense } from "react";
import type { Metadata } from "next";

import { ActivateAccountForm } from "@/components/auth/activate-account-form";

export const metadata: Metadata = {
  title: "Set your password · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ActivateAccountForm />
    </Suspense>
  );
}
