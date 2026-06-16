// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: the world-first entrance, promoted from the Golden Pasture
 * bake-off skin into the live boot. The armed world fills the frame (a fresh
 * close-eye render behind warm frosted glass); its difficulty, your dog, and
 * Play sit on a calm glass panel. Instant (image decode only), unmistakably the
 * game. Browsing worlds swaps a static render; the scene builds only on Play.
 *
 * Reads the live BootFlow (armed world/dog/difficulty + real load progress) and
 * a `nav` of routing callbacks (the secondary destinations stay reachable:
 * settings is the corner gear, leaderboard the corner trophy, and the ways to
 * play route to multiplayer / sandbox / 2-player).
 */
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { Z } from '../../ui/zIndex.js';
import { pastoral, alpha } from '../ui/tokens';
import { useMenuNavigation } from '../hooks/useMenuNavigation';
import { WorldImage, DogAvatar } from './sceneComponents';
import { Icon } from '../ui/Icon';
import { useViewport } from '../hooks/useViewport';
import { formatSheep } from './worlds';
import { COUNTING_GAME_MODE } from '../../../shared/countingModes.js';
import { useRenameField } from '../shared/useRenameField';
import { isMobileClient } from '../../utils/isMobileClient.js';
import { shouldWarnMobileSheep } from '../../utils/mobileSheepWarning.js';
import { MobilePerfWarning } from './MobilePerfWarning';
import { TutorialOffer } from '../Tutorial/index.js';
import type { BootFlow } from './useBootFlow';

export interface EntranceNav {
  onLeaderboard: () => void;
  onAchievements: () => void;
  onSettings: () => void;
  onSandbox: () => void;
  onLocal: () => void;
  onMultiplayer: () => void;
}

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 82),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 10px 34px rgba(43,38,32,0.22)',
};

const chipRound: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
  border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 5), color: pastoral.ink, cursor: 'pointer',
};

// Project links that used to sit in the in-game #site-footer now live in this
// quiet entrance menu.
const SITE_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: 'About', href: '/about' },
  { label: 'Scenes', href: '/scenes/home-field' },
  { label: 'Source', href: 'https://github.com/matthew-kissinger/sds', external: true },
];

const SOURCE_URL = 'https://github.com/matthew-kissinger/sds';
const SOURCE_LABEL = 'github.com/matthew-kissinger/sds';

function CornerNav({ nav }: { nav: EntranceNav }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const btn: CSSProperties = {
    width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: alpha(pastoral.cream, 70), border: `1px solid ${pastoral.glassWarmBorder}`,
    color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  };
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 10 }}>
      <button style={btn} title="Leaderboard" aria-label="Leaderboard" onClick={nav.onLeaderboard}><Icon name="trophy" size={18} /></button>
      <button style={btn} title="Achievements" aria-label="Achievements" onClick={nav.onAchievements}><Icon name="award" size={18} /></button>
      <button style={btn} title="Settings" aria-label="Settings" onClick={nav.onSettings}><Icon name="settings" size={18} /></button>
      <button style={btn} title="About this project" aria-label="About this project" aria-expanded={infoOpen} onClick={() => setInfoOpen((o) => !o)}><Icon name="info" size={18} /></button>
      {infoOpen && (
        <>
          <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: Z.panel }} />
          <div style={{
            position: 'absolute', top: 48, right: 0, minWidth: 168, padding: 6, zIndex: Z.panel + 1,
            background: alpha(pastoral.cream, 92), border: `1px solid ${pastoral.glassWarmBorder}`,
            borderRadius: 14, boxShadow: '0 10px 30px rgba(43,38,32,0.24)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            display: 'flex', flexDirection: 'column',
          }}>
            {SITE_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => setInfoOpen(false)}
                style={{ padding: '9px 12px', borderRadius: 9, color: pastoral.ink, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = alpha(pastoral.accentMeadow, 14); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Cycle 57 P7: read the stored leaderboard display name without importing the
// identity module (which has a window.submitGameScore side effect we don't want
// in the entrance bundle). Falls back to the Cycle 51 default name.
function readDisplayName(): string {
  try {
    const raw = localStorage.getItem('playerIdentity');
    const id = raw ? JSON.parse(raw) : null;
    return (id && typeof id.displayName === 'string' && id.displayName) || 'Shepherd';
  } catch {
    return 'Shepherd';
  }
}

// Cycle 58 P8: the pre-play naming affordance. Collapsed it reads "Playing as
// {name}"; tapping it opens an inline pastoral editor over the shared rename
// hook (same auth-gated path as Settings). Never a gate — the player can ignore
// it and Play. The entrance uses literal copy (it is not wired to i18n), so the
// few rename error keys are mapped to plain English here.
function entranceErrText(key: string): string {
  if (key === 'identity.errorTooLong') return 'Name must be 20 characters or less.';
  if (key === 'identity.errorEmpty') return 'Enter a name.';
  return 'Could not save. Try again.';
}

function PlayingAsField({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const { draft, setDraft, status, save, identity } = useRenameField({ onSaved: () => setOpen(false) });
  const name = (identity?.displayName as string) || readDisplayName();
  const saving = status === 'saving';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Set your leaderboard name"
        style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: compact ? 11 : 12, color: pastoral.inkSoft }}
      >
        Playing as <span style={{ color: pastoral.ink, fontWeight: 600 }}>{name}</span>
      </button>
    );
  }

  return (
    <div style={{ margin: '12px auto 0', maxWidth: 340 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <input
          type="text"
          value={draft}
          maxLength={20}
          autoFocus
          placeholder="Your name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !saving) save(); if (e.key === 'Escape') setOpen(false); }}
          onFocus={() => { try { (window as unknown as { isTypingInInput?: boolean }).isTypingInInput = true; } catch { /* ignore */ } }}
          onBlur={() => { try { (window as unknown as { isTypingInInput?: boolean }).isTypingInInput = false; } catch { /* ignore */ } }}
          style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 10, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.cream, 70), color: pastoral.ink, fontSize: 13, outline: 'none' }}
        />
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', background: pastoral.accentMeadow, color: pastoral.cream, fontSize: 13, fontWeight: 600 }}
        >
          {saving ? '...' : 'Save'}
        </button>
      </div>
      {status && typeof status === 'object' && status.error && (
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: pastoral.ink }}>
          {entranceErrText(status.error)}
        </div>
      )}
    </div>
  );
}

export function Entrance({ flow, nav }: { flow: BootFlow; nav: EntranceNav }) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);
  // P1-MOBILE-WARN: a mobile client arming a >1000-sheep solo mode (Insane
  // 3,000 / Chaos 5,000) gets a performance warning before the round builds.
  // Continue commits anyway (player choice wins); go back stays here.
  const [perfWarnOpen, setPerfWarnOpen] = useState(false);
  // A coming-soon world (Newsheepdogland, switched off for the regression burn-down)
  // is non-committable. The badge + disabled Play below reflect it; this guard is the
  // belt-and-suspenders against a keyboard/controller commit reaching flow.commit().
  const comingSoon = !!flow.world.comingSoon;
  const handlePlay = () => {
    if (comingSoon) return;
    if (shouldWarnMobileSheep({ sheepCount: flow.mode.sheep, gameMode: flow.family.gameMode, isMobile: isMobileClient() })) {
      setPerfWarnOpen(true);
      return;
    }
    flow.commit();
  };
  // Cycle 60 P3: controller + keyboard navigation over the entrance controls.
  // Additive - every button keeps its mouse/touch onClick.
  const rootRef = useRef<HTMLDivElement>(null);
  useMenuNavigation(rootRef);

  // [P3-ACHIEVE-UNLOCK] Cosmetic badge layer on the dog swap row: dogs the
  // player has completed a solo round with carry a small gold check. Read
  // from the achievements progress slice via a lazy import (the achievements
  // module stays out of the entrance chunk); a load failure just means no
  // badges. No dog is ever locked - selection is unaffected.
  const [completedDogs, setCompletedDogs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    import('../../achievements/dogBadges.js')
      .then((m) => { if (!cancelled) setCompletedDogs(m.getCompletedDogIds()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // P11: prefetch the sibling worlds' backdrops during idle so switching is
  // instant (the armed world's backdrop is preloaded with fetchpriority=high in
  // index.html). Best-effort, cancelled if the entrance unmounts first.
  useEffect(() => {
    let cancelled = false;
    const preload = () => { if (!cancelled) for (const w of flow.worlds) { const img = new Image(); img.src = w.render; } };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(preload, { timeout: 2000 }); else window.setTimeout(preload, 400);
    return () => { cancelled = true; };
  }, [flow.worlds]);

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Armed world backdrop with a slow zoom and a warm legibility gradient. */}
      <div style={{ position: 'absolute', inset: 0, animation: flow.reducedMotion ? 'none' : 'sds-kenburns 26s ease-in-out infinite alternate' }}>
        <WorldImage world={flow.world} reducedMotion={flow.reducedMotion} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.28) 0%, rgba(43,38,32,0) 26%, rgba(43,38,32,0) 52%, rgba(43,38,32,0.55) 100%)' }} />

      {/* Top: title + corner nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: compact ? 'max(16px, env(safe-area-inset-top)) 16px 16px' : '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: compact ? 20 : 26, color: pastoral.cream, textShadow: '0 2px 12px rgba(43,38,32,0.5)' }}>
          Sheepdog Simulator
        </div>
        <CornerNav nav={nav} />
      </div>

      {/* Bottom: the armed-world panel */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', padding: compact ? 0 : '0 0 28px' }}>
        <div style={{
          ...glass,
          width: compact ? '100%' : 'min(620px, 92%)',
          borderRadius: compact ? '22px 22px 0 0' : 22,
          padding: compact ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : '20px 22px',
          animation: flow.reducedMotion ? 'none' : 'sds-rise 360ms cubic-bezier(0.25,0.8,0.35,1)',
        }}>
          {/* World switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={flow.prevWorld} title="Previous world" aria-label="Previous world" style={chipRound}><Icon name="prev" size={18} /></button>
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 22 : 26, fontWeight: 600, lineHeight: 1.1 }}>
                {flow.world.name}
                {flow.world.experimental && (
                  <span
                    title="Work in progress: performance tuning is ongoing"
                    style={{
                      display: 'inline-block', verticalAlign: 'middle', marginLeft: 8, padding: '2px 9px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`,
                      background: alpha(pastoral.ink, 6), color: pastoral.inkSoft,
                    }}
                  >
                    Experimental
                  </span>
                )}
                {flow.world.comingSoon && (
                  <span
                    title="In the workshop. Play Rolling Hills or Open Country for now."
                    style={{
                      display: 'inline-block', verticalAlign: 'middle', marginLeft: 8, padding: '2px 9px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`,
                      background: alpha(pastoral.accentGold, 18), color: pastoral.ink,
                    }}
                  >
                    Coming soon
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 3, lineHeight: 1.25, overflow: 'hidden', textOverflow: compact ? undefined : 'ellipsis', whiteSpace: compact ? 'normal' : 'nowrap' }}>{flow.world.tagline}</div>
            </div>
            <button onClick={flow.nextWorld} title="Next world" aria-label="Next world" style={chipRound}><Icon name="next" size={18} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {flow.worlds.map((w, i) => (
              <span key={w.id} style={{ width: i === flow.worldIndex ? 18 : 7, height: 7, borderRadius: 999, background: i === flow.worldIndex ? pastoral.accentGold : alpha(pastoral.ink, 22), transition: 'all 200ms' }} />
            ))}
          </div>

          {/* Cycle 59: mode-family selector. A multi-family world (Home Field,
              Rolling Hills) shows Classic + Counting Sheep chips; a single-family
              world (Open Country = Objective) renders the family as a label. */}
          {flow.families.length > 1 ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {flow.families.map((f) => {
                const active = f.id === flow.family.id;
                return (
                  <button key={f.id} onClick={() => flow.setFamily(f.id)} style={{
                    flexShrink: 0, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
                    background: active ? pastoral.accentGold : alpha(pastoral.ink, 5),
                    color: active ? pastoral.ink : pastoral.inkSoft,
                  }}>
                    {f.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: pastoral.inkSoft }}>
              {flow.family.name}
            </div>
          )}

          {/* Rung chips: solo difficulties (sheep count) or counting curves (a
              short hint, since a counting run starts at one sheep). */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
            {flow.modes.map((m) => {
              const active = m.id === flow.mode.id;
              const counting = flow.family.gameMode === COUNTING_GAME_MODE;
              return (
                <button key={m.id} onClick={() => flow.setMode(m.id)} style={{
                  flexShrink: 0, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
                  background: active ? pastoral.accentMeadow : alpha(pastoral.ink, 5),
                  color: active ? pastoral.cream : pastoral.ink, textAlign: 'left', minWidth: 84,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {counting
                      ? <span>{m.blurb}</span>
                      : <><Icon name="sheep" size={12} color={active ? pastoral.cream : pastoral.inkSoft} /> {formatSheep(m.sheep)}</>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dog + Play */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={() => setDogOpen((o) => !o)} aria-label={`Your dog: ${flow.dog.name}. Tap to change.`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 4, paddingRight: 12, borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 4), cursor: 'pointer', color: pastoral.ink }}>
              <DogAvatar dog={flow.dog} size={40} active />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.dog.name}</div>
                <div style={{ fontSize: 11, color: pastoral.inkSoft }}>{flow.dog.trait}</div>
              </div>
            </button>
            <button onClick={handlePlay} disabled={comingSoon} aria-disabled={comingSoon} style={{
              flex: 1, height: 52, borderRadius: 16, border: 'none', cursor: comingSoon ? 'not-allowed' : 'pointer',
              background: comingSoon ? alpha(pastoral.ink, 10) : pastoral.accentMeadow,
              color: comingSoon ? pastoral.inkSoft : pastoral.cream, fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: comingSoon ? 'none' : `0 6px 18px ${alpha(pastoral.accentMeadow, 45)}`,
            }}>
              {comingSoon ? 'Coming soon' : <><Icon name="play" size={20} /> Play</>}
            </button>
          </div>

          {/* Dog swap row */}
          {dogOpen && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {flow.dogs.map((d) => (
                <button key={d.id} onClick={() => { flow.setDog(d.id); setDogOpen(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: pastoral.ink }}>
                  <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                    <DogAvatar dog={d} size={44} active={d.id === flow.dog.id} />
                    {completedDogs.has(d.id) && (
                      <span
                        title={`Completed a solo round with ${d.name}`}
                        aria-label={`Completed a solo round with ${d.name}`}
                        data-dog-badge={d.id}
                        style={{
                          position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: '50%',
                          background: pastoral.accentGold, color: pastoral.ink, display: 'grid', placeItems: 'center',
                          border: `1px solid ${pastoral.glassWarmBorder}`, boxShadow: '0 1px 4px rgba(43,38,32,0.3)',
                        }}
                      >
                        <Icon name="check" size={10} strokeWidth={2.6} />
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11 }}>{d.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Secondary ways to play */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={nav.onMultiplayer} style={wayBtn}><Icon name="users" size={14} /> Play online</button>
            <button onClick={nav.onSandbox} style={wayBtn}><Icon name="sandbox" size={14} /> Sandbox</button>
            <button onClick={nav.onLocal} style={wayBtn}><Icon name="local" size={14} /> 2-player</button>
          </div>
          {/* Cycle 58 P8: current leaderboard name; tap to set it inline (no
              gate, no leaving the entrance). Was a link to Settings (Cycle 57 P7). */}
          <PlayingAsField compact={compact} />
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: compact ? 10 : 11, lineHeight: 1.25, color: pastoral.inkSoft }}>
            (c) 2026 Matthew Kissinger and contributors - source (AGPL-3.0):{' '}
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ color: pastoral.ink, textDecoration: 'underline' }}>
              {SOURCE_LABEL}
            </a>
          </div>
        </div>
      </div>

      {/* P1-TUTORIAL: first-run offer card. Self-gating on sds:tutorialDone;
          renders nothing for returning players. */}
      <TutorialOffer dogId={flow.dog.id} />

      {/* P1-MOBILE-WARN: big-flock performance warning for mobile clients. */}
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

const wayBtn: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: pastoral.inkSoft, fontSize: 13,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
