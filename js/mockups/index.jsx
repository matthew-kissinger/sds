/**
 * Cycle 51 P1: mockup bake-off entry. Mounts the harness into #mockups-root.
 *
 * Named index.jsx (not mockups.jsx) so `import { MockupHarness } from './MockupHarness'`
 * resolves to the .tsx, not back to this entry, on a case-insensitive filesystem.
 * No game-runtime import: a pure React + CSS surface that composites headlessly,
 * the review surface for the 10-way entrance/flow bake-off.
 */
import { createRoot } from 'react-dom/client';
import { MockupHarness } from './MockupHarness';

const el = document.getElementById('mockups-root');
if (el) createRoot(el).render(<MockupHarness />);
