import type { Metadata } from "next";

import { AccountantLoginForm } from "@/components/auth/accountant-login-form";

export const metadata: Metadata = {
  title: "Accountants and bookkeepers · Sole",
};

export default function AccountantLoginPage() {
  return <AccountantLoginForm />;
}
