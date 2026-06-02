/**
 * Cycle 51 P1: the loading-stage timeline, calibrated to the real measured
 * cold-build cost of Rolling Hills (cycle45-validation/load-baseline.md): the
 * GLB parse of the dog and the fence kit dominate, terrain and grass are the
 * mid stages, the rest are cheap. The mock loading bar animates over these
 * weights so it feels honest, and the seam to the real per-stage `logStep`
 * marks in js/boot/initWorld.js is a one-line swap when the winner is wired.
 *
 * Labels are calm and concrete (prose-and-voice.md): the quiet end of a working
 * day on one pasture and two islands. No hype, no em-dashes.
 */
export interface LoadStage {
  key: string;
  label: string;
  /** Calibrated cost in milliseconds. */
  ms: number;
}

export const STAGES: LoadStage[] = [
  { key: 'heightfield', label: 'Shaping the land', ms: 70 },
  { key: 'terrain', label: 'Raising the hills', ms: 250 },
  { key: 'grass', label: 'Growing the grass', ms: 185 },
  { key: 'trees', label: 'Planting the trees', ms: 120 },
  { key: 'models', label: 'Waking the dog', ms: 600 },
  { key: 'structures', label: 'Setting the fences', ms: 360 },
  { key: 'flock', label: 'Gathering the flock', ms: 120 },
];

export const TOTAL_MS: number = STAGES.reduce((sum, s) => sum + s.ms, 0);

/**
 * Map elapsed milliseconds to a fractional progress (0..1) and the active stage
 * label. Progress is by cumulative real cost, so the bar moves at the pace the
 * real build would, slowing through the heavy dog and fence stages.
 */
export function stageAt(elapsedMs: number): { progress: number; label: string } {
  const clamped = Math.max(0, Math.min(TOTAL_MS, elapsedMs));
  let acc = 0;
  let label = STAGES[0].label;
  for (const s of STAGES) {
    if (clamped <= acc + s.ms) {
      label = s.label;
      break;
    }
    acc += s.ms;
    label = s.label;
  }
  return { progress: clamped / TOTAL_MS, label };
}
