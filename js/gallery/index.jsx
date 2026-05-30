/**
 * Cycle 49 P3: gallery entry. Mounts the UI gallery into #gallery-root.
 *
 * Named index.jsx (not gallery.jsx) so that `import { Gallery } from './Gallery'`
 * resolves to Gallery.tsx, not back to this entry, on a case-insensitive
 * filesystem (gallery vs Gallery collide on Windows/macOS). No game-runtime
 * import: a pure React + CSS surface that composites headlessly. It is the
 * program's review surface while headless WebGPU cannot composite the game.
 */
import { createRoot } from 'react-dom/client';
import { Gallery } from './Gallery';

const el = document.getElementById('gallery-root');
if (el) createRoot(el).render(<Gallery />);
