/**
 * Public pages — reachable without signing in, so outside the app shell. The
 * route group keeps that separation without adding a segment to the URL.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
