"use client";

import { useAtom, useSetAtom } from "jotai";
import {
  Clock,
  Eye,
  Landmark,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SoleLogo } from "@/components/layout/sole-logo";
import { connectBankIntroOpenAtom, connectBankOpenAtom } from "@/lib/atoms";
import { useCountryContext } from "@/hooks/use-country-context";
import { bankFeedProvider } from "@/lib/country-context";

/**
 * What happens before anyone is asked to hand over bank access.
 *
 * Handing a third party a read of your bank is the most consequential thing
 * this product asks for, and the provider's own flow opens on a bank picker —
 * so the things worth knowing get said here, in our words, before that screen
 * appears. Continue is the only thing that launches it; Escape, the backdrop
 * and Cancel all leave without starting anything.
 *
 * Four equal rows made the two that matter — read-only, and the login never
 * leaving your bank — weigh the same as the two that are terms of service. The
 * first two now sit in a panel of their own, and the other two are one quiet
 * line underneath, which is the weight they deserve.
 */
export function ConnectBankIntroModal() {
  const [open, setOpen] = useAtom(connectBankIntroOpenAtom);
  const openProviderFlow = useSetAtom(connectBankOpenAtom);
  const { country } = useCountryContext();
  const isAkahu = bankFeedProvider(country) === "akahu";

  const proceed = () => {
    setOpen(false);
    openProviderFlow(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* gap-3 rather than the default gap-4: the panel and the note below it
          are one thought, and the extra air read as an unfinished layout. */}
      <DialogContent className="gap-3 sm:max-w-md">
        <ConnectionGraphic />

        <DialogHeader>
          <DialogTitle>Connect your bank securely</DialogTitle>
          <DialogDescription>
            {isAkahu ? (
              <>
                Sole uses Akahu, New Zealand&apos;s open finance platform, to
                import your transactions automatically.
              </>
            ) : (
              <>
                Sole uses Fiskil, an accredited provider under Australia&apos;s
                Consumer Data Right, to import your transactions automatically.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/*
          The two assurances people actually want, in one panel so they read as
          a single guarantee rather than a list of features.
        */}
        <div className="space-y-3 rounded-[14px] bg-[#F0F0FF] p-4 dark:bg-primary/10">
          {/*
            One row component for both lines, so the icon size, the gap and the
            text's top offset can't drift apart between them — the two lines
            start at the same left edge because it's the same markup, not
            because two sets of classes happen to agree today.
          */}
          <PanelLine icon={Eye}>
            <span className="text-[15px] font-semibold leading-snug">
              Read-only access — Sole can never move money.
            </span>
          </PanelLine>
          <PanelLine icon={ShieldCheck}>
            <span className="text-sm font-medium leading-snug text-[#6B7280] dark:text-muted-foreground">
              Your bank login is never shared with Sole.
            </span>
          </PanelLine>
        </div>

        {/* The terms of the access, rather than a promise about it — so one
            quiet line rather than two rows competing with the panel above. */}
        <p className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[#9CA3AF] dark:text-muted-foreground/80">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {isAkahu ? (
            <>
              Access can be revoked anytime in Settings &gt; Connections, or
              at my.akahu.nz.
            </>
          ) : (
            <>
              Access lasts 12 months and can be revoked anytime in Settings
              &gt; Connections.
            </>
          )}
        </p>

        {/* Says what the next screen is, so the provider's own flow doesn't
            arrive as a surprise. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isAkahu
            ? "Next you'll go to Akahu's site to pick your bank and confirm what you're sharing, then come straight back. Takes about 2 minutes."
            : "Next you'll pick your bank and confirm what you're sharing. Takes about 2 minutes."}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={proceed}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A line in the assurance panel: tinted square, then the text.
 *
 * `font-semibold` rather than `font-bold` deliberately — it compiles to 600,
 * which is what's wanted here; 700 next to a 14px line below it reads as a
 * heading rather than a sentence.
 */
function PanelLine({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="pt-1.5">{children}</span>
    </div>
  );
}

/**
 * Us, a dashed line, your bank.
 *
 * The picture the modal is about: a connection being made between two things,
 * with the dashes saying it isn't made yet. Decorative — the heading beneath it
 * carries the meaning — so it's hidden from screen readers entirely rather than
 * described twice.
 */
function ConnectionGraphic() {
  return (
    <div className="flex h-14 items-center justify-center gap-3" aria-hidden>
      <SoleLogo className="h-6 w-auto" />
      <span className="w-8 border-t-2 border-dashed border-primary/40" />
      <span className="grid size-11 place-items-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.05] text-primary">
        <Landmark className="size-5" />
      </span>
    </div>
  );
}
