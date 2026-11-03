import Link from "next/link";

/**
 * The consent line under an auth form. Shared, because sign-in and sign-up
 * carry the same one with a different verb — and because a legal sentence that
 * exists twice will eventually disagree with itself.
 *
 * Deliberately unwrapped: it goes in AuthLayout's `footer`, which is already a
 * <p>. Bringing its own made a <p> inside a <p>, which is invalid HTML — the
 * browser silently closes the outer one, so the server's markup and the
 * client's disagree and React throws the whole server render away.
 */
export function AuthLegalLine({ action }: { action: string }) {
  return (
    <>
      By {action}, you agree to Sole&apos;s{" "}
      <Link
        href="/legal/privacy"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        Privacy Policy
      </Link>{" "}
      and{" "}
      <Link
        href="/legal/terms"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        Terms and Conditions
      </Link>
    </>
  );
}
