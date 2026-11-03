"use client";

import * as React from "react";

import { type Bank } from "@/lib/banks";
import { cn } from "@/lib/utils";

/**
 * Shared tile geometry. Exported so the Sole mark on the consent screen sits in
 * exactly the same box as the bank beside it — the two can't drift apart.
 */
export const LOGO_TILE =
  "grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl";

/** Fills the tile without cropping, whether the mark is a roundel or a wordmark. */
export const LOGO_IMAGE = "size-full object-contain p-1.5";

/**
 * A bank's mark: its logo where we have the file, otherwise its initials on its
 * brand colour. The brand colours are inline hex rather than theme tokens, and
 * deliberately don't respond to dark mode — a brand is a brand in both themes.
 *
 * See the trademark note in `lib/banks.ts`: the coloured tile needs the same
 * clearance as the logo it stands in for.
 */
export function BankLogo({
  bank,
  className,
}: {
  bank: Bank;
  className?: string;
}) {
  // A missing file 404s and fires onError, so the tile shows through rather than
  // leaving a broken image.
  const [failed, setFailed] = React.useState(false);
  const showLogo = !!bank.logo && !failed;

  /**
   * The same fallback for an image that was server-rendered.
   *
   * `error` fires once. Where the markup came from the server, the request is
   * already finished by the time React attaches its handler, so onError never
   * arrives and the broken image stays — which is exactly what the dashboard's
   * account rows showed, while the dialog, whose images mount on the client,
   * fell back correctly. A finished image with no intrinsic width is what a
   * failure looks like after the fact.
   */
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [bank.logo]);

  return (
    <span
      className={cn(
        LOGO_TILE,
        !showLogo && "text-[13px] font-extrabold tracking-tight",
        className,
      )}
      style={
        showLogo ? undefined : { backgroundColor: bank.bg, color: bank.fg }
      }
      // Decorative: every caller shows the bank's name beside it.
      aria-hidden
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={bank.logo}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={LOGO_IMAGE}
        />
      ) : (
        bank.label
      )}
    </span>
  );
}
