// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useMemo, useState, type CSSProperties } from 'react';
import type { FlockSize } from '@app/state/store';
import { formatRunTime } from '@app/ui/time';
import { pluralKey, translatePlural, useT } from '@app/i18n/store';
import {
  COLLAPSED_RUNS, formatDelta, groupRunsByFlockSize, localizedOrdinal, type SizeGroup,
} from './runGroups';
import { historyShareText, cardShareTitle, formatCardClock } from './share';
import { ShareControl } from './ShareControl';
import type { PlayerRun } from './types';
import { localizedWeekLabel } from './week';

/**
 * The player's own history, one section per flock size.
 *
 * The flat list this replaced interleaved all three sizes in submission order,
 * which put a 4:58 run with 200 sheep directly above a 0:38 run with 25 and
 * invited a comparison that means nothing. Sections make the only comparison
 * that does - a time against the player's other times at the same size - the
 * one the layout actually offers.
 */
export function MyTimes({ runs }: { readonly runs: readonly PlayerRun[] }) {
  const t = useT();
  const groups = useMemo(() => groupRunsByFlockSize(runs), [runs]);
  const [expanded, setExpanded] = useState<readonly FlockSize[]>([]);
  const sizesRun = groups.filter((group) => group.runs.length > 0).length;
  // The counts are drawn bold, so each sentence is cut where its number goes.
  const [finishedBefore, finishedAfter] = t(pluralKey('mine.finished', runs.length)).split('{count}');
  const [sizesBefore, sizesAfter] = t('mine.sizesRun', { total: groups.length }).split('{count}');

  return (
    <div className="herd-mine">
      <p className="herd-mine__summary">
        <span>{finishedBefore}<b>{runs.length}</b>{finishedAfter}</span>
        <span>{sizesBefore}<b>{sizesRun}</b>{sizesAfter}</span>
      </p>
      {groups.map((group) => (
        <Group
          key={group.flockSize}
          group={group}
          expanded={expanded.includes(group.flockSize)}
          onToggle={() => setExpanded((open) => (
            open.includes(group.flockSize)
              ? open.filter((size) => size !== group.flockSize)
              : [...open, group.flockSize]
          ))}
        />
      ))}
    </div>
  );
}

function Group({ group, expanded, onToggle }: {
  readonly group: SizeGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const t = useT();
  const { flockSize, runs, boardPlayers } = group;
  const best = runs[0];
  const collapsible = runs.length > COLLAPSED_RUNS;
  const shown = collapsible && !expanded ? runs.slice(0, COLLAPSED_RUNS) : runs;
  const listId = `my-times-${flockSize}`;
  // One run has nothing to measure itself against, so the group draws no bar.
  // The cell stays in the grid: hiding it rather than dropping it keeps the
  // times in one column down the whole panel, which is what makes the three
  // sections scan as one table instead of three.
  const bars = runs.length > 1;

  return (
    <section className="herd-mine-group">
      <header className="herd-mine-group__head">
        <h3 className="herd-mine-group__size">{translatePlural('common.sheepCount', flockSize)}</h3>
        <p className="herd-mine-group__count">
          {runs.length === 0 ? t('mine.noRuns') : translatePlural('mine.runs', runs.length)}
          {boardPlayers === null ? '' : ` · ${t('mine.onBoard', { count: boardPlayers })}`}
        </p>
      </header>
      {best === undefined ? (
        <p className="herd-mine-empty">{t('mine.emptyHint')}</p>
      ) : (
        <>
          <p className="herd-mine-best">
            <span className="herd-mine-best__label">{t('mine.best')}</span>
            <span className="herd-mine-best__time">
              {formatRunTime(best.run.scoreSeconds * 1000)}
              {best.run.boardRank === undefined || best.run.boardPlayers === undefined ? null : (
                <span className="herd-mine-best__standing">
                  {t('mine.standing', { rank: localizedOrdinal(best.run.boardRank), players: best.run.boardPlayers })}
                </span>
              )}
            </span>
          </p>
          <ol
            id={listId}
            className={`herd-mine-runs${bars ? '' : ' herd-mine-runs--single'}`}
            aria-label={t('mine.listLabel', { count: flockSize })}
          >
            {shown.map(({ run, position, deltaSeconds, fill }) => (
              <li key={`${run.submittedAt}-${run.scoreSeconds}`} data-best={position === 1}>
                <span className="herd-run__rank">{position}</span>
                <span className="herd-run__bar">
                  {bars ? <i style={{ '--fill': fill } as CSSProperties} /> : null}
                </span>
                <span className="herd-run__time">{formatRunTime(run.scoreSeconds * 1000)}</span>
                <span className="herd-run__meta" data-best={position === 1}>
                  <b>{position === 1 ? t('mine.bestBadge') : formatDelta(deltaSeconds)}</b>
                  {run.boardRank === undefined ? null : <em>{localizedOrdinal(run.boardRank)}</em>}
                </span>
                <span className="herd-run__share-slot">
                  {run.sharePath ? (
                    <ShareControl
                      compact
                      path={run.sharePath}
                      title={cardShareTitle(formatCardClock(run.scoreSeconds), flockSize)}
                      text={historyShareText({
                        clock: formatCardClock(run.scoreSeconds),
                        flockSize,
                        weekRank: run.weekRank,
                        weekPlayers: run.weekPlayers,
                        weekLabel: run.weekLabel === undefined ? undefined : localizedWeekLabel(run.weekLabel, run.submittedAt),
                      })}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {collapsible ? (
            <button
              type="button"
              className="herd-mine-more"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={onToggle}
            >
              {expanded
                ? t('mine.showFewer')
                : t('mine.showAll', { count: runs.length })}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
