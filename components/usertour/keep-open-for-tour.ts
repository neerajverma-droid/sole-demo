/**
 * For a Radix dialog or sheet that a Usertour tour runs over.
 *
 * The tour card is drawn on the host page, outside the dialog, so to Radix a
 * press on it — or focus moving into its iframe — is an interaction outside,
 * and the dialog closes under the step that was describing it. Pass this as
 * the content's `onInteractOutside` and the dialog stays put for the tour
 * while still closing on any other outside click.
 *
 * The card staying clickable at all is globals.css's job: a modal Radix
 * dialog turns off pointer events on `body`, and the SDK leaves its card to
 * inherit them.
 */
export function keepOpenForTour(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  const target = event.target;
  if (target instanceof Element && target.closest(TOUR_UI)) {
    event.preventDefault();
  }
}

/** Every element the SDK puts on the host page carries one of these classes. */
const TOUR_UI = '[class*="usertour-widget-"]';
