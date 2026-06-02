/**
 * Cycle 51 P1: shared keyframes, fonts, and base reset for the bake-off route,
 * injected once by the harness. Kept here instead of css/main.css so the mockup
 * route stays fully isolated from the live stylesheet. The display face uses a
 * system serif (Georgia) as the Fraunces stand-in, matching the gallery; the
 * real self-hosted Fraunces woff2 lands when the winner is wired (the design
 * language calls it a later step). No external font CDN, so the route is
 * self-contained and composites headlessly.
 */
const CSS = `
:root {
  --mock-display: Georgia, 'Times New Roman', 'Iowan Old Style', serif;
  --mock-text: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

html, body { margin: 0; padding: 0; background: #14110d; }
#mockups-root { font-family: var(--mock-text); color: var(--color-ink); -webkit-font-smoothing: antialiased; }
#mockups-root *, #mockups-root *::before, #mockups-root *::after { box-sizing: border-box; }
#mockups-root button { font-family: inherit; }

@keyframes mock-mote {
  0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
  50% { transform: translateY(-14px) translateX(6px); opacity: 0.7; }
}
@keyframes mock-drift {
  0% { background-position: 50% 50%; }
  50% { background-position: 54% 46%; }
  100% { background-position: 50% 50%; }
}
@keyframes mock-kenburns {
  0% { transform: scale(1.02); }
  100% { transform: scale(1.1); }
}
@keyframes mock-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mock-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mock-pulse-soft {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
@keyframes mock-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  #mockups-root *, #mockups-root *::before, #mockups-root *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
`;

export function MockupStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
