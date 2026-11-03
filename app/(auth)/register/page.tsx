import { Suspense } from "react";
import type { Metadata } from "next";

import { RegisterScreen } from "@/components/auth/register-screen";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";

export const metadata: Metadata = {
  title: "Create your account · Sole",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<BrandSplashLoader/>}>
      <RegisterScreen />
    </Suspense>
  );
}
