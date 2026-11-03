/**
 * The businesses chooser sits outside the app shell — no sidebar, no top bar.
 * Matches sole-webapp's /business-profile, which renders its own bare page
 * rather than the dashboard shell: there's no "current business" yet for the
 * sidebar's business-scoped nav to be scoped to. The route group keeps that
 * separation without adding a segment to the URL.
 */
export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh w-full bg-muted/30 p-4 md:p-7">
      <div className="mx-auto max-w-6xl animate-rise">{children}</div>
    </main>
  );
}
