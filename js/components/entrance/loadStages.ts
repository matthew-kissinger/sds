// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: the scene-load stage table for the pastoral loading bar. The
 * boot path (main.js) emits each build-step label over the GameBridge bus; this
 * maps that label to a friendly pastoral caption and a fractional progress, so
 * the bar fills from real per-stage cost instead of a fixed timer.
 *
 * Lives on the UI side (not in main.js) so the label table stays out of the
 * main chunk; main only publishes a bare signal + the raw label. The weights
 * are calibrated to the real measured cold-build cost (the dog GLB parse and
 * the fence kit dominate; terrain and grass are the mid stages) so the bar
 * slows through the heavy stages and feels honest.
 *
 * Captions follow .claude/rules/prose-and-voice.md: the quiet end of a working
 * day on one pasture and two islands. No hype, no em-dashes.
 */
interface LoadStage {
  /** Exact logStep label buildSceneBody emits. */
  label: string;
  friendly: string;
  /** Calibrated relative cost. */
  w: number;
}

const STAGES: LoadStage[] = [
  { label: 'Loading 3D models', friendly: 'Waking the dogs', w: 600 },
  { label: 'Models loaded', friendly: 'Waking the dogs', w: 0 },
  { label: 'Loading heightfield', friendly: 'Shaping the land', w: 70 },
  { label: 'Creating terrain', friendly: 'Raising the hills', w: 250 },
  { label: 'Creating grass', friendly: 'Growing the grass', w: 185 },
  { label: 'Adding environment details', friendly: 'Scattering the stones', w: 60 },
  { label: 'Creating trees', friendly: 'Planting the trees', w: 120 },
  { label: 'Adding mountains', friendly: 'Raising the far hills', w: 40 },
  { label: 'Adding farm house', friendly: 'Opening the farmhouse', w: 30 },
  { label: 'Loading fence models', friendly: 'Setting the fences', w: 200 },
  { label: 'Building structures', friendly: 'Setting the fences', w: 160 },
  { label: 'Building anime water', friendly: 'Filling the shore', w: 60 },
  { label: 'Creating sheepdog', friendly: 'Waking the dog', w: 40 },
  { label: 'Creating sheep flock', friendly: 'Gathering the flock', w: 120 },
  { label: 'Scene body complete', friendly: 'Gathering the flock', w: 0 },
];

const TOTAL = STAGES.reduce((s, x) => s + x.w, 0) || 1;

const BY_LABEL = new Map<string, { friendly: string; pct: number }>();
{
  let acc = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const startFrac = acc;
    acc += STAGES[i].w;
    BY_LABEL.set(STAGES[i].label, {
      friendly: STAGES[i].friendly,
      // Fill to the start of this stage as it begins; the next mark fills the
      // rest. The terminal 'Scene body complete' clamps to 100.
      pct: i === STAGES.length - 1 ? 100 : Math.round((startFrac / TOTAL) * 100),
    });
  }
}

/** The caption shown the instant Play is pressed, before the first mark. */
export const FIRST_LOAD_LABEL = STAGES[0].friendly;

/** Map a raw build-step label to { pct, label }. Unknown labels return null. */
export function mapLoadStep(label: string): { pct: number; label: string } | null {
  const s = BY_LABEL.get(label);
  if (!s) return null;
  return { pct: s.pct, label: s.friendly };
}
