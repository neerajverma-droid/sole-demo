import { AuthGuard } from "@/components/auth/auth-guard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ActivationNudge } from "@/components/activation/activation-nudge";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { CurrencyBoundary } from "@/components/layout/currency-boundary";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SupportChat } from "@/components/layout/support-chat";
import { TopBar } from "@/components/layout/top-bar";
import { TrialBanner } from "@/components/layout/trial-banner";
import { VerifyEmailBanner } from "@/components/layout/verify-email-banner";
import { OnboardingSurveyPopup } from "@/components/onboarding/survey/onboarding-survey-popup";

/**
 * The app shell.
 *
 * No first-run guard here any more. It used to wrap this whole layout and
 * redirect an unfinished account to `/welcome`, which is what made onboarding a
 * place you were sent. It's an overlay on the dashboard now — see
 * `FirstRunOverlay` — so the blocking happens over the product rather than
 * instead of it, and the layout is just the layout again.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <VerifyEmailBanner />
        <TrialBanner />
        <TopBar />
        {/*
          Above the page rather than inside it, and mounted once: the nudge
          decides for itself whether this route is one it belongs on, so no
          screen has to opt in — see `ActivationNudge`. Its banner tier draws
          in the page's own gutter, so it reads as the first block of the
          content rather than a second strip of chrome.
        */}
        <ActivationNudge />
        {/* Muted page bed so cards read as surfaces rather than white on white. */}
        <main className="w-full flex-1 bg-muted/30 p-4 md:p-4">
          <div className="animate-rise">
            <CurrencyBoundary>{children}</CurrencyBoundary>
          </div>
        </main>
      </div>
      <CommandPalette />
      <SupportChat />
      {/*
        Pip's post-signup survey (join_from, sidebar shortcuts, a first job,
        and — two minutes later, on its own — referral source). Self-gating,
        same as the three mounts above: it decides on its own whether there's
        a proved session and anything still owed. See its own file doc.
      */}
      <OnboardingSurveyPopup />
    </SidebarProvider>
  );
}
