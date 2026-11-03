/**
 * A stand-in for the Usertour spotlight that lives across steps.
 *
 * The SDK throws its spotlight away on every step and builds a new one at the
 * next target, with a frame or two of nothing in between. So the cut-out jumps
 * from one section to the next, the dimming blinks off and on as it does, and
 * the hole hugs the target's edges with no room around it. None of that is
 * reachable from the theme: there is no padding setting, and the element it
 * would animate doesn't survive the step.
 *
 * This keeps one element of its own for the life of the tour and copies the
 * SDK's spotlight onto it — position from its box, ring and dim from its
 * computed box-shadow, so the theme still decides the colours. Moving between
 * steps it glides; while the page merely scrolls it follows exactly. The SDK's
 * own spotlight stays in the DOM for its click-blocking curtains and is only
 * hidden, and only while this is mounted (see globals.css), so if this ever
 * stops running the stock spotlight is what's left rather than nothing.
 */

const SOURCE = ".usertour-widget-spotlight";
/** Room between the target's edge and the ring. */
const PAD = 8;
/** How long a move between steps takes — the curve the SDK slides its card on. */
const GLIDE_MS = 450;
const EASE = "cubic-bezier(0.25, 0.8, 0.5, 1)";
/**
 * How long a glide keeps easing after a step change. Long enough to cover the
 * smooth scroll to the next target, which moves the source the whole time.
 */
const GLIDE_WINDOW_MS = 1000;
/** Grace for the gap between one step's spotlight and the next. */
const LINGER_MS = 250;

export function mountTourSpotlight(): () => void {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const ghost = document.createElement("div");
  ghost.className = "sole-tour-spotlight";
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  document.documentElement.setAttribute("data-sole-tour-spotlight", "");

  let source: HTMLElement | null = null;
  let showing = false;
  let glideUntil = 0;
  let lingerTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const sync = () => {
    if (!source) return;
    // A new step's spotlight is mounted before the SDK has placed it — no
    // inset yet, so it sits wherever the stage happens to be — and then
    // starts out invisible until its target is measured. Copying either would
    // blink the dimming off or send the ring off to the bottom of the page, so
    // the previous step's spotlight holds until this one has somewhere to be.
    const placed = source.style.inset !== "" || source.style.top !== "";
    const hidden = !placed || source.style.opacity === "0";
    if (hidden && performance.now() < glideUntil) return;

    const box = source.getBoundingClientRect();
    const gliding = !reducedMotion && performance.now() < glideUntil;
    ghost.style.transition = gliding
      ? ["top", "left", "width", "height"]
          .map((prop) => `${prop} ${GLIDE_MS}ms ${EASE}`)
          .concat("opacity 200ms linear")
          .join(", ")
      : "opacity 200ms linear";
    // In page coordinates, not the viewport's like the source: scrolling then
    // carries the ring along with the page for free, and only a real move —
    // a new target — changes these numbers and gets eased. Fixed coordinates
    // would ease every scroll frame too, and the ring would trail the page.
    ghost.style.top = `${box.top + window.scrollY - PAD}px`;
    ghost.style.left = `${box.left + window.scrollX - PAD}px`;
    ghost.style.width = `${box.width + PAD * 2}px`;
    ghost.style.height = `${box.height + PAD * 2}px`;
    ghost.style.zIndex = source.style.zIndex;
    ghost.style.boxShadow = getComputedStyle(source).boxShadow;
    // Otherwise follow it: the SDK also hides its spotlight while the target
    // is scrolled out of reach.
    ghost.style.opacity = hidden ? "0" : "1";
  };

  // The source's inline style is rewritten as the page scrolls or the step's
  // target resizes; follow every change.
  const sourceObserver = new MutationObserver(sync);

  const adopt = (next: HTMLElement | null) => {
    if (next === source) return;
    sourceObserver.disconnect();
    source = next;

    if (!next) {
      // Probably just the gap between steps. Hold the dimming over it, and
      // only fade out if nothing takes its place.
      lingerTimer = setTimeout(() => {
        ghost.style.transition = "opacity 200ms linear";
        ghost.style.opacity = "0";
        showing = false;
      }, LINGER_MS);
      return;
    }

    clearTimeout(lingerTimer);
    // Arriving from another step glides; the first step of a tour lands where
    // it is, at full strength, so it doesn't fade up after a modal's backdrop
    // has already gone.
    glideUntil = showing ? performance.now() + GLIDE_WINDOW_MS : 0;
    showing = true;
    sync();
    // Once the hold is over, look again: if the new spotlight is still hidden
    // and the SDK doesn't touch it again, nothing else would.
    clearTimeout(settleTimer);
    if (glideUntil) settleTimer = setTimeout(sync, GLIDE_WINDOW_MS + 20);
    sourceObserver.observe(next, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  };

  // One class lookup per batch of DOM changes, rather than inspecting every
  // node the app adds or removes.
  const domObserver = new MutationObserver(() => {
    adopt(document.querySelector<HTMLElement>(SOURCE));
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
  adopt(document.querySelector<HTMLElement>(SOURCE));

  return () => {
    clearTimeout(lingerTimer);
    clearTimeout(settleTimer);
    domObserver.disconnect();
    sourceObserver.disconnect();
    ghost.remove();
    document.documentElement.removeAttribute("data-sole-tour-spotlight");
  };
}
