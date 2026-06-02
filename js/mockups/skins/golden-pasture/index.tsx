/**
 * Skin 1 - Golden Pasture. The lead recommendation: world-first, photo-real
 * in-repo scene renders behind warm frosted glass. The armed world fills the
 * frame; its difficulty, your dog, and Play sit on a calm glass panel. Instant
 * (image decode only), unmistakably the game. This is the quality bar the other
 * nine skins are measured against.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 82),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 10px 34px rgba(43,38,32,0.22)',
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

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* Armed world backdrop with a slow zoom and a warm legibility gradient. */}
      <div style={{ position: 'absolute', inset: 0, animation: flow.reducedMotion ? 'none' : 'mock-kenburns 26s ease-in-out infinite alternate' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.28) 0%, rgba(43,38,32,0) 26%, rgba(43,38,32,0) 52%, rgba(43,38,32,0.55) 100%)' }} />
      <MoteField count={14} reducedMotion={flow.reducedMotion} />

      {/* Top: title + corner nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: compact ? '16px 16px' : '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 20 : 26, color: pastoral.cream, textShadow: '0 2px 12px rgba(43,38,32,0.5)' }}>
          Sheepdog Simulator
        </div>
        <CornerNav />
      </div>

      {/* Bottom: the armed-world panel */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', padding: compact ? 0 : '0 0 28px' }}>
        <div style={{
          ...glass,
          width: compact ? '100%' : 'min(620px, 92%)',
          borderRadius: compact ? '22px 22px 0 0' : 22,
          padding: compact ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : '20px 22px',
          animation: flow.reducedMotion ? 'none' : 'mock-rise 360ms cubic-bezier(0.25,0.8,0.35,1)',
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

const chipRound: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
  border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 5), color: pastoral.ink, cursor: 'pointer',
};

function LoadingView({ flow }: SkinViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', transform: 'scale(1.05)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 38) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...glass, padding: '30px 28px', width: 'min(440px, 92%)', textAlign: 'center' }}>
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

      {/* Top-left: sheep + stamina */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 168 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: '68%', height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
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

      {/* Mobile controls hint */}
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
  id: 'golden-pasture',
  name: 'Golden Pasture',
  tagline: 'World-first over photo-real renders behind warm glass. The lead.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
