/**
 * Skin - Living Diorama. World-first, motion-forward. Sells the feeling of a
 * LIVE 3D diorama using only static renders plus CSS motion: the armed world
 * sits inside a soft-edged rounded "portal" (like a snow-globe vignette of that
 * world) with a continuous slow ken-burns drift, dusk motes floating over it,
 * and a warm light-sweep gliding across the glass. The menu wraps around the
 * portal on warm glass. Switching worlds cross-dissolves the portal content.
 * The whole thing should read as quietly alive and breathing while staying a
 * cheap static image. flow.reducedMotion freezes everything to a still frame.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/* Skin-scoped keyframes. The shared sheet owns mock-kenburns / mock-mote /
 * mock-rise; the diorama's signature is the warm light-sweep gliding across the
 * glass and the slow cross-dissolve when the portal content swaps, neither of
 * which exists upstream. Scoped under .living-diorama so nothing leaks. The
 * shared @media(prefers-reduced-motion) reset still neutralizes these, and every
 * animation below is additionally gated on flow.reducedMotion. */
const LOCAL_CSS = `
.living-diorama .ld-sweep {
  animation: ld-sweep 7.5s ease-in-out infinite;
}
@keyframes ld-sweep {
  0%   { transform: translateX(-130%) rotate(8deg); opacity: 0; }
  18%  { opacity: 0.9; }
  50%  { opacity: 0.55; }
  82%  { opacity: 0.9; }
  100% { transform: translateX(130%) rotate(8deg); opacity: 0; }
}
.living-diorama .ld-pane {
  animation: ld-dissolve 520ms cubic-bezier(0.25, 0.8, 0.35, 1);
}
@keyframes ld-dissolve {
  from { opacity: 0; transform: scale(1.04); }
  to   { opacity: 1; transform: scale(1); }
}
.living-diorama .ld-breathe {
  animation: ld-breathe 9s ease-in-out infinite;
}
@keyframes ld-breathe {
  0%, 100% { box-shadow: 0 22px 60px rgba(43,38,32,0.34), 0 0 0 1px var(--color-glass-warm-border) inset, 0 0 38px rgba(245,210,160,0.0) inset; }
  50%      { box-shadow: 0 26px 70px rgba(43,38,32,0.40), 0 0 0 1px var(--color-glass-warm-border) inset, 0 0 46px rgba(245,210,160,0.16) inset; }
}
`;

function LocalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: LOCAL_CSS }} />;
}

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 84),
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

function CornerNav() {
  const btn: CSSProperties = {
    width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: alpha(pastoral.cream, 70), border: `1px solid ${pastoral.glassWarmBorder}`,
    color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)',
  };
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button style={btn} title="Leaderboard"><Icon name="trophy" size={18} /></button>
      <button style={btn} title="Settings"><Icon name="settings" size={18} /></button>
    </div>
  );
}

/**
 * The living vignette. The armed world render in a soft-edged rounded frame with
 * a slow ken-burns drift, dusk motes over it, and a warm light-sweep gliding
 * across the glass. `key` on the inner pane forces a remount on world change so
 * the content cross-dissolves. All motion is gated on reducedMotion.
 */
function Diorama({
  flow, height, radius = 26,
}: { flow: SkinViewProps['flow']; height: number | string; radius?: number }) {
  const rm = flow.reducedMotion;
  return (
    <div
      className={rm ? undefined : 'ld-breathe'}
      style={{
        position: 'relative', width: '100%', height, borderRadius: radius, overflow: 'hidden',
        border: `1px solid ${pastoral.glassWarmBorder}`,
        boxShadow: '0 22px 60px rgba(43,38,32,0.34)',
        background: pastoral.hillShadow,
      }}
    >
      {/* Cross-dissolving render pane: remounts on world change. */}
      <div key={flow.world.id} className={rm ? undefined : 'ld-pane'} style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', inset: 0, animation: rm ? 'none' : 'mock-kenburns 30s ease-in-out infinite alternate' }}>
          <WorldImage world={flow.world} />
        </div>
      </div>

      {/* Soft inner vignette so the frame reads as a curved snow-globe glass. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 100% at 50% 30%, rgba(43,38,32,0) 55%, rgba(43,38,32,0.42) 100%)',
      }} />
      {/* Dusk legibility wash toward the lower edge where the title sits. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(43,38,32,0.10) 0%, rgba(43,38,32,0) 34%, rgba(43,38,32,0) 60%, rgba(43,38,32,0.52) 100%)',
      }} />

      {/* Dusk motes drifting inside the glass. */}
      <MoteField count={12} reducedMotion={rm} />

      {/* Warm light-sweep gliding across the glass. Freezes (static still) when
          reduced motion is on; otherwise the .ld-sweep keyframe drives it. */}
      <div style={{ position: 'absolute', inset: '-20% -10%', pointerEvents: 'none', overflow: 'hidden' }}>
        <div
          className={rm ? undefined : 'ld-sweep'}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '42%',
            background: 'linear-gradient(100deg, rgba(255,244,222,0) 0%, rgba(255,240,210,0.22) 45%, rgba(255,236,200,0.40) 50%, rgba(255,240,210,0.22) 55%, rgba(255,244,222,0) 100%)',
            mixBlendMode: 'screen',
            transform: rm ? 'translateX(40%) rotate(8deg)' : undefined,
            opacity: rm ? 0.5 : undefined,
          }}
        />
      </div>

      {/* "LIVE" implication badge, lower-left inside the glass. */}
      <div style={{
        position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 999, background: alpha(pastoral.ink, 38),
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', color: pastoral.cream, fontSize: 11, letterSpacing: 0.4,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: pastoral.accentGold, animation: rm ? 'none' : 'mock-pulse-soft 2.4s ease-in-out infinite' }} />
        LIVE PREVIEW
      </div>
    </div>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);
  const rm = flow.reducedMotion;

  return (
    <div className="living-diorama" style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <LocalStyles />

      {/* Calm warm-dusk room behind the diorama: a soft pastoral wash, gently
          breathing. The diorama is the only "photo"; the surround is glass. */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(140% 120% at 50% -10%, ${pastoral.pastureGold} 0%, ${pastoral.pastureDawn} 38%, ${pastoral.pastureHorizon} 72%, ${pastoral.hillShadow} 100%)`,
        backgroundSize: '160% 160%',
        animation: rm ? 'none' : 'mock-drift 24s ease-in-out infinite',
      }} />

      {/* Top: title + corner nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: compact ? '16px 16px' : '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 }}>
        <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 20 : 26, color: pastoral.ink, textShadow: `0 1px 0 ${alpha(pastoral.cream, 60)}` }}>
          Sheepdog Simulator
        </div>
        <CornerNav />
      </div>

      {/* Centered column: the living diorama, then the wrap-around glass menu. */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: compact ? 'flex-start' : 'center',
        gap: compact ? 14 : 18,
        padding: compact ? '70px 14px 14px' : '78px 24px 28px',
        overflowY: compact ? 'auto' : 'hidden',
      }}>
        {/* The portal / snow-globe diorama. Upper-center, soft-edged. */}
        <div style={{ width: compact ? '100%' : 'min(640px, 92%)', flexShrink: 0 }}>
          <Diorama flow={flow} height={compact ? 220 : 300} />
        </div>

        {/* Wrap-around warm-glass menu. */}
        <div style={{
          ...glass,
          width: compact ? '100%' : 'min(640px, 92%)',
          padding: compact ? '16px 16px calc(16px + env(safe-area-inset-bottom))' : '18px 22px',
          flexShrink: 0,
          animation: rm ? 'none' : 'mock-rise 360ms cubic-bezier(0.25,0.8,0.35,1)',
        }}>
          {/* World switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={flow.prevWorld} title="Previous world" style={chipRound}><Icon name="prev" size={18} /></button>
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 22 : 26, fontWeight: 600, lineHeight: 1.1 }}>{flow.world.name}</div>
              <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
            </div>
            <button onClick={flow.nextWorld} title="Next world" style={chipRound}><Icon name="next" size={18} /></button>
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
            <button onClick={() => setDogOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 4, paddingRight: 12, borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 4), cursor: 'pointer', color: pastoral.ink }}>
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
            {flow.ways.map((w) => (
              <button key={w.id} onClick={flow.commit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pastoral.inkSoft, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={w.id === 'online' ? 'users' : w.id === 'sandbox' ? 'sandbox' : 'local'} size={14} /> {w.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const rm = flow.reducedMotion;
  return (
    <div className="living-diorama" style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <LocalStyles />
      {/* The portal grows to fill the frame; the diorama keeps breathing while
          the calm bar sits over it. */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(140% 120% at 50% -10%, ${pastoral.pastureGold} 0%, ${pastoral.pastureDawn} 40%, ${pastoral.hillShadow} 100%)`,
      }} />
      <div style={{ position: 'absolute', inset: compact ? 12 : 22 }}>
        <Diorama flow={flow} height="100%" radius={compact ? 22 : 30} />
      </div>

      {/* Calm bar over the living portal. */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, pointerEvents: 'none' }}>
        <div style={{ ...glass, padding: '26px 26px', width: 'min(440px, 90%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontSize: 24, fontWeight: 600 }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, marginBottom: 22 }}>{flow.dog.name} · {flow.mode.name}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentMeadow} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InGameView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const total = flow.mode.sheep;
  const penned = Math.round(total * 0.42);
  const hudGlass: CSSProperties = {
    background: alpha(pastoral.cream, 80), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${pastoral.glassWarmBorder}`, borderRadius: 14, color: pastoral.ink,
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.25) 0%, rgba(43,38,32,0) 30%)' }} />

      {/* Top-left: sheep + progress */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 168 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: '42%', height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, right: compact ? 10 : 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.ink} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name="pause" size={18} color={pastoral.ink} />
        </button>
      </div>

      {/* Camera chip */}
      <div style={{ position: 'absolute', bottom: compact ? 100 : 20, left: compact ? 10 : 18, ...hudGlass, padding: '6px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="compass" size={14} color={pastoral.ink} /> Follow
      </div>

      {/* Mobile controls: joystick + sprint */}
      {compact && (
        <>
          <div style={{ position: 'absolute', bottom: 24, left: 18, width: 92, height: 92, borderRadius: '50%', border: `2px solid ${alpha(pastoral.cream, 60)}`, background: alpha(pastoral.ink, 18) }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%', background: alpha(pastoral.cream, 70) }} />
          </div>
          <div style={{ position: 'absolute', bottom: 36, right: 22, width: 68, height: 68, borderRadius: '50%', background: alpha(pastoral.accentMeadow, 80), display: 'grid', placeItems: 'center', color: pastoral.cream, fontWeight: 700, fontSize: 13 }}>RUN</div>
        </>
      )}

      {/* Return-to-menu (desktop) */}
      {!compact && (
        <button onClick={flow.exit} style={{ position: 'absolute', bottom: 20, right: 20, ...hudGlass, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <Icon name="prev" size={16} color={pastoral.ink} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'living-diorama',
  name: 'Living Diorama',
  tagline: 'The armed world as a live-feeling vignette portal.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
