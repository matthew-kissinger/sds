// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113 Phase 2 (D3, D7): the picker the entrance's one summary line opens.
 *
 * Direction A asks exactly one question on the primary surface. Everything the
 * old entrance asked inline - mode family, difficulty rung, dog - collapses to
 * a summary line and expands here, in place, without leaving the door.
 *
 * Purely presentational over the live `BootFlow`. Every write goes through
 * flow.setFamily / flow.setMode / flow.setDog, which already own the
 * localStorage slots and the per-family rung routing; this component owns no
 * persistence of its own beyond the session-local `More` toggle.
 *
 * Two shape rules worth stating, both resolved in docs/cycle-113-plan.md:
 *
 *   Families stay their own row (Q1). Folding a counting curve and a sheep
 *   count into one flat list of seven would lose the fact that they are
 *   different kinds of thing. A single-family world renders no row at all.
 *
 *   Three rungs plus More (Q2, D7), where "three" means the first three of
 *   whatever ladder the armed world carries rather than a hardcoded id list,
 *   because the islands run their own ladders. The armed rung is always
 *   visible even when it sits outside that head, so a player returning after a
 *   Chaos run never opens the picker to three rungs, none of them theirs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { DogAvatar } from './sceneComponents';
import { formatSheep } from './worlds';
import { COUNTING_GAME_MODE } from '../../../shared/countingModes.js';
import type { BootFlow } from './useBootFlow';

/** D7: how many rungs sit on the surface before "More". */
export const VISIBLE_RUNGS = 3;

/**
 * The rungs to render, given the full ladder, the armed rung and whether the
 * player has expanded. Exported so the spec can exercise the D7 rule directly
 * rather than through a render.
 */
export function visibleRungs<T extends { id: string }>(
  rungs: readonly T[],
  armedId: string,
  expanded: boolean,
): T[] {
  if (expanded || rungs.length <= VISIBLE_RUNGS) return [...rungs];
  const head = rungs.slice(0, VISIBLE_RUNGS);
  if (head.some((r) => r.id === armedId)) return head;
  const armed = rungs.find((r) => r.id === armedId);
  return armed ? [...head, armed] : head;
}

export function EntrancePicker({ flow, onClose }: { flow: BootFlow; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const counting = flow.family.gameMode === COUNTING_GAME_MODE;

  // The completed-run badges. Lazily imported so the achievements module stays
  // out of the entrance chunk, and now deferred further than before: it loads
  // when the picker opens rather than when the entrance mounts. A load failure
  // just means no badges; no dog is ever locked.
  const [completedDogs, setCompletedDogs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    import('../../achievements/dogBadges.js')
      .then((m) => { if (!cancelled) setCompletedDogs(m.getCompletedDogIds()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rungs = useMemo(
    () => visibleRungs(flow.modes, flow.mode.id, expanded),
    [flow.modes, flow.mode.id, expanded],
  );
  const hidden = flow.modes.length - rungs.length;

  return (
    <div className="sds-ent-picker" data-sds-picker="">
      {/* Q1: a single-family world renders no selector. Home Field and Rolling
          Hills carry Solo + Counting Sheep; Open Country and Newsheepdogland
          carry one family each, and a chip row of one is just a label. */}
      {flow.families.length > 1 && (
        <div className="sds-ent-picker-group">
          <div className="sds-ent-picker-label">Mode</div>
          <div className="sds-ent-chiprow">
            {flow.families.map((f) => (
              <button
                key={f.id}
                type="button"
                className={f.id === flow.family.id ? 'sds-ent-chip sds-ent-chip-on' : 'sds-ent-chip'}
                aria-pressed={f.id === flow.family.id}
                onClick={() => flow.setFamily(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sds-ent-picker-group">
        <div className="sds-ent-picker-label">{counting ? 'Curve' : 'Difficulty'}</div>
        <div className="sds-ent-rungs">
          {rungs.map((m) => {
            const on = m.id === flow.mode.id;
            return (
              <button
                key={m.id}
                type="button"
                className={on ? 'sds-ent-rung sds-ent-rung-on' : 'sds-ent-rung'}
                aria-pressed={on}
                // Stated rather than computed from the contents. An accessible
                // name assembled from two inline spans concatenates without a
                // separator ("Classic200"), which is both worse to hear and a
                // silent break for the `/Classic\s+\d/i` selector the perf and
                // mobile e2e specs match a rung by.
                aria-label={counting ? `${m.name} ${m.blurb}` : `${m.name} ${formatSheep(m.sheep)} sheep`}
                onClick={() => flow.setMode(m.id)}
              >
                <span className="sds-ent-rung-name">{m.name}</span>
                <span className="sds-ent-rung-meta">
                  {counting ? m.blurb : <><Icon name="sheep" size={12} /> {formatSheep(m.sheep)}</>}
                </span>
              </button>
            );
          })}
          {hidden > 0 && (
            <button
              type="button"
              className="sds-ent-more"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${hidden} more difficult${hidden === 1 ? 'y' : 'ies'}`}
            >
              More
            </button>
          )}
        </div>
      </div>

      <div className="sds-ent-picker-group">
        <div className="sds-ent-picker-label">Dog</div>
        <div className="sds-ent-dogs">
          {flow.dogs.map((d) => (
            <button
              key={d.id}
              type="button"
              className="sds-ent-dog"
              aria-pressed={d.id === flow.dog.id}
              // Same reason as the rung above: DogAvatar is a role="img" with
              // its own label, so the computed name would read "Dog: PipPip".
              aria-label={`Play as ${d.name}`}
              // Picking a dog is the end of the question, so it closes. Picking
              // a family or a rung does not: a player changing difficulty often
              // changes family in the same breath.
              onClick={() => { flow.setDog(d.id); onClose(); }}
            >
              <span className="sds-ent-dog-wrap">
                <DogAvatar dog={d} size={44} active={d.id === flow.dog.id} />
                {completedDogs.has(d.id) && (
                  <span
                    className="sds-ent-dog-badge"
                    title={`Completed a solo round with ${d.name}`}
                    aria-label={`Completed a solo round with ${d.name}`}
                    data-dog-badge={d.id}
                  >
                    <Icon name="check" size={10} strokeWidth={2.6} />
                  </span>
                )}
              </span>
              <span>{d.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
