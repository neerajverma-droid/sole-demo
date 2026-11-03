/**
 * Eases each Usertour tour card in, rather than letting it pop and wander.
 *
 * On every step the SDK mounts the new card at full opacity, parked 20px off
 * its target, and holds it there — following the target as the page scrolls
 * to it — until the position has been still for 250ms. Only then does it
 * slide the card home. So pressing Next shows a card that blinks in, jitters
 * along with the scroll, and then jumps into its slide.
 *
 * This hides the card for that parked phase and fades and scales it in at the
 * moment the slide starts, so it arrives with the SDK's own movement — after
 * the spotlight (tour-spotlight.ts) has already glided to the new target. The
 * phase is read off the card's inline style, which is the only signal the SDK
 * gives: `transition: none` while parked, a transform transition once sliding.
 *
 * Both states are CSS animations (see globals.css) rather than an opacity
 * rule, because the SDK writes `opacity: 1` inline and only an animation
 * outranks an inline style without `!important` — which would also outrank
 * the SDK's own hiding when a target scrolls out of reach.
 */

/** Tooltip cards only: modal and bubble surfaces have no parked phase. */
const CARD =
  "[data-usertour-popper-content-wrapper][data-usertour-popper-data-placement]";
/** A card still parked after this long is shown regardless. */
const HOLD_LIMIT_MS = 1500;

export function mountTourCardMotion(): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  const cards = new Set<HTMLElement>();
  const holdTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const show = (card: HTMLElement) => {
    clearTimeout(holdTimers.get(card));
    holdTimers.delete(card);
    card.dataset.soleTourCard = "in";
  };

  const sync = (card: HTMLElement) => {
    if (card.style.transition.includes("transform")) {
      show(card);
      return;
    }
    // Parked — a new step, or the same card re-placed on another side.
    if (card.dataset.soleTourCard === "hold") return;
    card.dataset.soleTourCard = "hold";
    holdTimers.set(
      card,
      setTimeout(() => show(card), HOLD_LIMIT_MS),
    );
  };

  const styleObserver = new MutationObserver((records) => {
    for (const record of records) sync(record.target as HTMLElement);
  });

  const scan = () => {
    for (const card of cards) {
      if (card.isConnected) continue;
      clearTimeout(holdTimers.get(card));
      holdTimers.delete(card);
      cards.delete(card);
    }
    document.querySelectorAll<HTMLElement>(CARD).forEach((card) => {
      if (cards.has(card)) return;
      cards.add(card);
      sync(card);
      styleObserver.observe(card, {
        attributes: true,
        attributeFilter: ["style"],
      });
    });
  };

  const domObserver = new MutationObserver(scan);
  domObserver.observe(document.body, { childList: true, subtree: true });
  scan();

  return () => {
    domObserver.disconnect();
    styleObserver.disconnect();
    holdTimers.forEach((timer) => clearTimeout(timer));
    cards.forEach((card) => delete card.dataset.soleTourCard);
  };
}
