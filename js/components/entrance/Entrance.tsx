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
import { useState, useEffect, type CSSProperties } from 'react';
import { pastoral, alpha } from '../ui/tokens';
import { WorldImage, DogAvatar } from './sceneComponents';
import { Icon } from '../ui/Icon';
import { useViewport } from '../hooks/useViewport';
import { formatSheep } from './worlds';
import type { BootFlow } from './useBootFlow';

export interface EntranceNav {
  onLeaderboard: () => void;
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

function CornerNav({ nav }: { nav: EntranceNav }) {
  const btn: CSSProperties = {
    width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: alpha(pastoral.cream, 70), border: `1px solid ${pastoral.glassWarmBorder}`,
    color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  };
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button style={btn} title="Leaderboard" aria-label="Leaderboard" onClick={nav.onLeaderboard}><Icon name="trophy" size={18} /></button>
      <button style={btn} title="Settings" aria-label="Settings" onClick={nav.onSettings}><Icon name="settings" size={18} /></button>
    </div>
  );
}

export function Entrance({ flow, nav }: { flow: BootFlow; nav: EntranceNav }) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
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
              <div style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 22 : 26, fontWeight: 600, lineHeight: 1.1 }}>{flow.world.name}</div>
              <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
            </div>
            <button onClick={flow.nextWorld} title="Next world" aria-label="Next world" style={chipRound}><Icon name="next" size={18} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {flow.worlds.map((w, i) => (
              <span key={w.id} style={{ width: i === flow.worldIndex ? 18 : 7, height: 7, borderRadius: 999, background: i === flow.worldIndex ? pastoral.accentGold : alpha(pastoral.ink, 22), transition: 'all 200ms' }} />
            ))}
          </div>

          {/* Difficulty chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto', paddingBottom: 2 }}>
            {flow.modes.map((m) => {
              const active = m.id === flow.mode.id;
              return (
                <button key={m.id} onClick={() => flow.setMode(m.id)} style={{
                  flexShrink: 0, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
                  background: active ? pastoral.accentMeadow : alpha(pastoral.ink, 5),
                  color: active ? pastoral.cream : pastoral.ink, textAlign: 'left', minWidth: 84,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Icon name="sheep" size={12} color={active ? pastoral.cream : pastoral.inkSoft} /> {formatSheep(m.sheep)}
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
            <button onClick={flow.commit} style={{
              flex: 1, height: 52, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: pastoral.accentMeadow, color: pastoral.cream, fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 6px 18px ${alpha(pastoral.accentMeadow, 45)}`,
            }}>
              <Icon name="play" size={20} /> Play
            </button>
          </div>

          {/* Dog swap row */}
          {dogOpen && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {flow.dogs.map((d) => (
                <button key={d.id} onClick={() => { flow.setDog(d.id); setDogOpen(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: pastoral.ink }}>
                  <DogAvatar dog={d} size={44} active={d.id === flow.dog.id} />
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
        </div>
      </div>
    </div>
  );
}

const wayBtn: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: pastoral.inkSoft, fontSize: 13,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
