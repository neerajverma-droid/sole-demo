import { AuthGuard } from "@/components/auth/auth-guard";

/**
 * Onboarding is post-sign-up, not pre — it's the account describing itself, so
 * it needs the session every one of its calls will be made with. Without this
 * the steps render for a signed-out visitor and only discover the loss when the
 * first save fails.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
