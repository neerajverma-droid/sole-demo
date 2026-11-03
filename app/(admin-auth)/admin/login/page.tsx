import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/auth/admin-login-form";

export const metadata: Metadata = {
  title: "Admin sign in · Sole",
};

/**
 * In its own route group rather than under `(admin)`, because that layout's
 * guard sends anyone signed out to this page — a sign-in page behind it would
 * redirect to itself.
 */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
