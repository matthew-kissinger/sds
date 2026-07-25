// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113 Phase 3 (D3): the One Door entrance.
 *
 * The front-end review counted seven decision rows before Play and two meadow-
 * green primary buttons on first paint. This surface asks exactly one question.
 * The armed world fills the frame, its name and tagline sit on a short panel,
 * and under them one summary line and one Play. World, mode, rung and dog
 * collapse into that summary line and expand in place through EntrancePicker.
 *
 * What left, and where it went (D6):
 *
 *   name field    off the entrance entirely; it belongs at first score
 *                 submission, where it has a reason to exist
 *   licence line  the corner menu, since Cycle 112 Phase 3
 *   sandbox       the corner menu
 *   2-player      the corner menu
 *   leaderboard   the corner menu (was a corner icon of its own)
 *   achievements  the corner menu (likewise)
 *   multiplayer   stays, as a text-weight line. D6's one explicit exception,
 *                 because nobody finds it otherwise
 *   tutorial      inside the first round (D4, Phase 4). Removing the offer card
 *                 is what removes the second primary button
 *
 * The panel is deliberately short. All four D8 heroes put the dog between 73.5%
 * and 76% down the frame, so a collapsed panel whose top edge stays below 72%
 * of viewport height shows the dog the heroes were framed around instead of
 * covering it, which is what the old 362px panel did on every scene. Phase 6
 * measures this rather than trusting the arithmetic.
 *
 * Styling is css/entrance.css. This file carries className and no inline style
 * object: that is the whole point of the migration, since the 47 inline objects
 * this component used to hold are why its controls had no hover, focus or
 * active states.
 */
import { useState, useRef, useEffect } from 'react';
import { useMenuNavigation } from '../hooks/useMenuNavigation';
import { WorldImage } from './sceneComponents';
import { Icon } from '../ui/Icon';
import { formatSheep } from './worlds';
import { COUNTING_GAME_MODE } from '../../../shared/countingModes.js';
import { isMobileClient } from '../../utils/isMobileClient.js';
import { shouldWarnMobileSheep } from '../../utils/mobileSheepWarning.js';
import { MobilePerfWarning } from './MobilePerfWarning';
import { EntrancePicker } from './EntrancePicker';
import type { BootFlow } from './useBootFlow';

export interface EntranceNav {
  onLeaderboard: () => void;
  onAchievements: () => void;
  onSettings: () => void;
  onSandbox: () => void;
  onLocal: () => void;
  onMultiplayer: () => void;
}

const SOURCE_URL = 'https://github.com/matthew-kissinger/sds';
const SOURCE_LABEL = SOURCE_URL.replace(/^https:\/\//, '');
const SITE_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: 'About', href: '/about' },
  { label: 'Scenes', href: '/scenes/home-field' },
  { label: 'Source', href: SOURCE_URL, external: true },
];

/**
 * The armed selection as one sentence. Exported for the spec: this string is
 * the entrance's only statement of what Play will start, so it is worth
 * pinning independently of the markup around it.
 */
export function summarize(flow: BootFlow): string {
  if (flow.family.gameMode === COUNTING_GAME_MODE) {
    return `${flow.family.name}, ${flow.mode.name}, with ${flow.dog.name}`;
  }
  return `${flow.mode.name}, ${formatSheep(flow.mode.sheep)} sheep, with ${flow.dog.name}`;
}

/** D3: world switching moves onto the image edges, out of the panel. */
function WorldArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const label = dir === 'prev' ? 'Previous world' : 'Next world';
  return (
    <button type="button" className={`sds-ent-iconbtn sds-ent-arrow sds-ent-arrow-${dir}`} title={label} aria-label={label} onClick={onClick}>
      <Icon name={dir} size={18} />
    </button>
  );
}

/**
 * Settings, then everything else behind one menu. Four corner icons was four
 * affordances competing at first paint; two is a door and a drawer.
 */
function CornerMenu({ nav }: { nav: EntranceNav }) {
  const [open, setOpen] = useState(false);
  const pick = (go: () => void) => () => { setOpen(false); go(); };

  return (
    <div className="sds-ent-corner">
      <button type="button" className="sds-ent-iconbtn" title="Settings" aria-label="Settings" onClick={nav.onSettings}>
        <Icon name="settings" size={18} />
      </button>
      <button
        type="button"
        className="sds-ent-iconbtn"
        title="More"
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <>
          <div className="sds-ent-menu-scrim" onClick={() => setOpen(false)} />
          <div className="sds-ent-menu">
            <button type="button" className="sds-ent-menu-item" onClick={pick(nav.onLeaderboard)}>Leaderboard</button>
            <button type="button" className="sds-ent-menu-item" onClick={pick(nav.onAchievements)}>Achievements</button>
            <button type="button" className="sds-ent-menu-item" onClick={pick(nav.onSandbox)}>Sandbox</button>
            <button type="button" className="sds-ent-menu-item" onClick={pick(nav.onLocal)}>2-player</button>
            {SITE_LINKS.map((l) => (
              <a
                key={l.label}
                className="sds-ent-menu-item"
                href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="sds-ent-legal">
              (c) 2026 Matthew Kissinger and contributors. Source under AGPL-3.0 at{' '}
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                {SOURCE_LABEL}
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Entrance({ flow, nav }: { flow: BootFlow; nav: EntranceNav }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // P1-MOBILE-WARN: a mobile client arming a >1000-sheep solo mode gets a
  // performance warning before the round builds. Continue commits anyway.
  const [perfWarnOpen, setPerfWarnOpen] = useState(false);
  // A coming-soon world (Newsheepdogland, gated per D19) is non-committable.
  // The badge and the disabled Play reflect it; this guard is the belt against
  // a keyboard or controller commit reaching flow.commit().
  const comingSoon = !!flow.world.comingSoon;

  const handlePlay = () => {
    if (comingSoon) return;
    if (shouldWarnMobileSheep({ sheepCount: flow.mode.sheep, gameMode: flow.family.gameMode, isMobile: isMobileClient() })) {
      setPerfWarnOpen(true);
      return;
    }
    flow.commit();
  };

  // Controller and keyboard navigation over the entrance controls. Escape
  // closes the picker when it is open and is otherwise left alone, so a player
  // who opened the one question can back out of it the obvious way.
  const rootRef = useRef<HTMLDivElement>(null);
  useMenuNavigation(rootRef, { onBack: pickerOpen ? () => setPickerOpen(false) : undefined });

  // Prefetch the sibling worlds' backdrops during idle so the edge arrows swap
  // instantly. The armed world's own backdrop is already preloaded at high
  // priority from index.html. Best-effort, cancelled if the entrance unmounts.
  useEffect(() => {
    let cancelled = false;
    const preload = () => { if (!cancelled) for (const w of flow.worlds) { const img = new Image(); img.src = w.render; } };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(preload, { timeout: 2000 }); else window.setTimeout(preload, 400);
    return () => { cancelled = true; };
  }, [flow.worlds]);

  return (
    <div ref={rootRef} className="sds-ent">
      <div className="sds-ent-hero sds-ent-hero-drift">
        <WorldImage world={flow.world} reducedMotion={flow.reducedMotion} />
      </div>
      <div className="sds-ent-veil" />

      <div className="sds-ent-top">
        <div className="sds-ent-wordmark">Sheep Dog Sim</div>
        <CornerMenu nav={nav} />
      </div>

      {/* On the photograph, not in the panel. See the masthead note in
          css/entrance.css for the measurement that put it there. */}
      <div className="sds-ent-masthead">
        <div className="sds-ent-world-name">
          {flow.world.name}
          {comingSoon && (
            <span className="sds-ent-badge" title="In the workshop. Play Home Field, Rolling Hills or Open Country for now.">
              Coming soon
            </span>
          )}
        </div>
        <div className="sds-ent-world-tagline">{flow.world.tagline}</div>
        <div className="sds-ent-dots">
          {flow.worlds.map((w, i) => (
            <span key={w.id} className={i === flow.worldIndex ? 'sds-ent-dot sds-ent-dot-on' : 'sds-ent-dot'} />
          ))}
        </div>
      </div>

      <WorldArrow dir="prev" onClick={flow.prevWorld} />
      <WorldArrow dir="next" onClick={flow.nextWorld} />

      <div className="sds-ent-dock">
        <div className="sds-ent-panel" data-sds-entrance-panel="">
          <button
            type="button"
            className="sds-ent-summary"
            aria-expanded={pickerOpen}
            aria-label={`${summarize(flow)}. Change.`}
            onClick={() => setPickerOpen((o) => !o)}
          >
            <span>{summarize(flow)}</span>
            <span className="sds-ent-summary-chevron"><Icon name="next" size={14} /></span>
          </button>

          {pickerOpen && <EntrancePicker flow={flow} onClose={() => setPickerOpen(false)} />}

          <button
            type="button"
            className="sds-ent-play"
            onClick={handlePlay}
            disabled={comingSoon}
            aria-disabled={comingSoon}
            data-nav-default=""
          >
            {comingSoon ? 'Coming soon' : <><Icon name="play" size={20} /> Play</>}
          </button>

          {/* D6's one exception: multiplayer keeps a line, at text weight. */}
          <button type="button" className="sds-ent-mp" onClick={nav.onMultiplayer}>
            <Icon name="users" size={14} /> Play online
          </button>
        </div>
      </div>

      {perfWarnOpen && (
        <MobilePerfWarning
          sheepCount={flow.mode.sheep}
          onContinue={() => { setPerfWarnOpen(false); flow.commit(); }}
          onBack={() => setPerfWarnOpen(false)}
        />
      )}
    </div>
  );
}
