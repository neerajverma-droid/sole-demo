import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginScreen } from "@/components/auth/login-screen";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";

export const metadata: Metadata = {
  title: "Sign in · Sole",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<BrandSplashLoader />}>
      <LoginScreen />
    </Suspense>
  );
}
