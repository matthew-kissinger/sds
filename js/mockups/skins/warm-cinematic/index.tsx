/**
 * Skin - Warm Cinematic. The deliberate dark contrast to the light pastoral
 * skins, testing whether a warm-DARK direction can still read as pastoral. The
 * armed world render fills the frame but is graded like a film still: a strong
 * warm vignette darkening to espresso at the edges, subtle letterbox bars, and
 * an amber grade over the top. Chrome is deep-espresso warm-glass with gold
 * hairlines; text is cream; the title is serif. Moody and premium, but warm
 * (gold / amber / espresso) - never blue or grey.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/* Deep-espresso warm-glass: dark base at high alpha, gold hairline, cream text. */
const darkGlass: CSSProperties = {
  background: alpha(pastoral.ink, 70),
  backdropFilter: 'blur(18px) saturate(115%)',
  WebkitBackdropFilter: 'blur(18px) saturate(115%)',
  border: `1px solid ${alpha(pastoral.accentGold, 32)}`,
  borderRadius: 22,
  color: pastoral.cream,
  boxShadow: '0 14px 44px rgba(10,7,4,0.55)',
};

/* The cinematic grade laid over the world render: warm radial vignette to
 * espresso at the edges, plus an amber wash and a bottom-weighted scrim for
 * legibility. One absolute-fill stack shared by Entrance / Loading / InGame. */
function CinematicGrade({ strong = false }: { strong?: boolean }) {
  return (
    <>
      {/* Warm radial vignette: bright-ish centre, espresso corners. */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 95% at 50% 42%, rgba(43,38,32,0) 38%, ${alpha(pastoral.ink, 55)} 74%, ${alpha(pastoral.ink, 92)} 100%)` }} />
      {/* Amber grade wash, warms the whole frame toward gold. */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${alpha(pastoral.accentGold, 16)} 0%, rgba(43,38,32,0) 45%, ${alpha(pastoral.ink, 30)} 100%)`, mixBlendMode: 'multiply' }} />
      {/* Bottom-weighted scrim so cream chrome reads over bright sky renders. */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(pastoral.ink, strong ? 42 : 30)} 0%, rgba(43,38,32,0) 30%, rgba(43,38,32,0) 50%, ${alpha(pastoral.ink, strong ? 78 : 64)} 100%)` }} />
    </>
  );
}

/* Subtle filmic letterbox bars, top and bottom. Thin on compact. */
function Letterbox({ compact }: { compact: boolean }) {
  const h = compact ? 18 : 30;
  const bar: CSSProperties = {
    position: 'absolute', left: 0, right: 0, height: h, background: '#14110d',
    pointerEvents: 'none', zIndex: 3,
  };
  return (
    <>
      <div style={{ ...bar, top: 0, boxShadow: '0 6px 14px rgba(10,7,4,0.5)' }} />
      <div style={{ ...bar, bottom: 0, boxShadow: '0 -6px 14px rgba(10,7,4,0.5)' }} />
    </>
  );
}

function CornerNav() {
  const btn: CSSProperties = {
    width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: alpha(pastoral.ink, 58), border: `1px solid ${alpha(pastoral.accentGold, 30)}`,
    color: pastoral.cream, cursor: 'pointer', backdropFilter: 'blur(8px)',
  };
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button style={btn} title="Leaderboard"><Icon name="trophy" size={18} /></button>
      <button style={btn} title="Settings"><Icon name="settings" size={18} /></button>
    </div>
  );
}

/* Small round prev/next, dark with a gold hairline. */
const chipRound: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
  border: `1px solid ${alpha(pastoral.accentGold, 30)}`, background: alpha(pastoral.cream, 6),
  color: pastoral.cream, cursor: 'pointer',
};

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)', background: '#14110d' }}>
      {/* Armed world render, slow push-in. */}
      <div style={{ position: 'absolute', inset: 0, animation: flow.reducedMotion ? 'none' : 'mock-kenburns 30s ease-in-out infinite alternate' }}>
        <WorldImage world={flow.world} />
      </div>
      <CinematicGrade />
      <MoteField count={12} reducedMotion={flow.reducedMotion} color={alpha(pastoral.accentGold, 60)} />
      <Letterbox compact={compact} />

      {/* Top: serif title in cream/gold + corner nav. */}
      <div style={{ position: 'absolute', top: compact ? 18 : 30, left: 0, right: 0, padding: compact ? '14px 16px' : '20px 30px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 4 }}>
        <div>
          <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 21 : 28, color: pastoral.cream, letterSpacing: 0.3, textShadow: '0 2px 16px rgba(10,7,4,0.7)' }}>
            Sheepdog <span style={{ color: pastoral.accentGold }}>Simulator</span>
          </div>
          {!compact && (
            <div style={{ fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: alpha(pastoral.cream, 60), marginTop: 4 }}>
              A herding picture
            </div>
          )}
        </div>
        <CornerNav />
      </div>

      {/* Bottom: the dark warm-glass armed-world bar. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: compact ? 0 : 30, display: 'flex', justifyContent: 'center', padding: compact ? 0 : '0 0 14px', zIndex: 4 }}>
        <div style={{
          ...darkGlass,
          width: compact ? '100%' : 'min(640px, 92%)',
          borderRadius: compact ? '22px 22px 0 0' : 22,
          padding: compact ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : '20px 24px',
          animation: flow.reducedMotion ? 'none' : 'mock-rise 380ms cubic-bezier(0.25,0.8,0.35,1)',
        }}>
          {/* World switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={flow.prevWorld} title="Previous world" style={chipRound}><Icon name="prev" size={18} /></button>
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 22 : 27, fontWeight: 600, lineHeight: 1.1, color: pastoral.cream }}>{flow.world.name}</div>
              <div style={{ fontSize: 13, color: alpha(pastoral.cream, 66), marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
            </div>
            <button onClick={flow.nextWorld} title="Next world" style={chipRound}><Icon name="next" size={18} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {flow.worlds.map((w, i) => (
              <span key={w.id} style={{ width: i === flow.worldIndex ? 18 : 7, height: 7, borderRadius: 999, background: i === flow.worldIndex ? pastoral.accentGold : alpha(pastoral.cream, 22), transition: 'all 200ms' }} />
            ))}
          </div>

          {/* Difficulty chips: active filled GOLD with espresso text; inactive dark with cream text. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto', paddingBottom: 2 }}>
            {flow.modes.map((m) => {
              const active = m.id === flow.mode.id;
              return (
                <button key={m.id} onClick={() => flow.setMode(m.id)} style={{
                  flexShrink: 0, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${active ? 'transparent' : alpha(pastoral.accentGold, 26)}`,
                  background: active ? pastoral.accentGold : alpha(pastoral.cream, 5),
                  color: active ? pastoral.ink : pastoral.cream, textAlign: 'left', minWidth: 84,
                  boxShadow: active ? `0 4px 14px ${alpha(pastoral.accentGold, 40)}` : 'none',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Icon name="sheep" size={12} color={active ? pastoral.ink : alpha(pastoral.cream, 70)} /> {formatSheep(m.sheep)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dog + Play */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={() => setDogOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 4, paddingRight: 12, borderRadius: 999, border: `1px solid ${alpha(pastoral.accentGold, 28)}`, background: alpha(pastoral.cream, 4), cursor: 'pointer', color: pastoral.cream }}>
              <DogAvatar dog={flow.dog} size={40} active />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.dog.name}</div>
                <div style={{ fontSize: 11, color: alpha(pastoral.cream, 62) }}>{flow.dog.trait}</div>
              </div>
            </button>
            <button onClick={flow.commit} style={{
              flex: 1, height: 52, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: `linear-gradient(180deg, ${pastoral.accentGold} 0%, #c98a3e 100%)`, color: pastoral.ink, fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 8px 22px ${alpha(pastoral.accentGold, 50)}`,
            }}>
              <Icon name="play" size={20} /> Play
            </button>
          </div>

          {/* Dog swap row */}
          {dogOpen && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {flow.dogs.map((d) => (
                <button key={d.id} onClick={() => { flow.setDog(d.id); setDogOpen(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: pastoral.cream }}>
                  <DogAvatar dog={d} size={44} active={d.id === flow.dog.id} />
                  <span style={{ fontSize: 11 }}>{d.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Secondary ways to play */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {flow.ways.map((w) => (
              <button key={w.id} onClick={flow.commit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: alpha(pastoral.cream, 62), fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)', background: '#14110d' }}>
      {/* Target world's backdrop, softly blurred and graded behind a calm gold bar. */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px)', transform: 'scale(1.06)' }}>
        <WorldImage world={flow.world} />
      </div>
      <CinematicGrade strong />
      <MoteField count={9} reducedMotion={flow.reducedMotion} color={alpha(pastoral.accentGold, 50)} />
      <Letterbox compact={compact} />

      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, zIndex: 4 }}>
        <div style={{ ...darkGlass, padding: '30px 30px', width: 'min(460px, 92%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontSize: 25, fontWeight: 600, color: pastoral.cream }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: alpha(pastoral.cream, 66), marginTop: 4, marginBottom: 22 }}>{flow.dog.name} · {flow.mode.name}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentGold} />
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
    background: alpha(pastoral.ink, 66), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${alpha(pastoral.accentGold, 28)}`, borderRadius: 14, color: pastoral.cream,
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)', background: '#14110d' }}>
      <WorldImage world={flow.world} />
      {/* Lighter grade in-game so the playfield stays readable, still warm-vignetted. */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(135% 110% at 50% 45%, rgba(43,38,32,0) 50%, ${alpha(pastoral.ink, 48)} 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(pastoral.ink, 28)} 0%, rgba(43,38,32,0) 26%)` }} />
      <Letterbox compact={compact} />

      {/* Top-left: sheep penned + progress */}
      <div style={{ position: 'absolute', top: compact ? 26 : 44, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 168, zIndex: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.accentGold} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: alpha(pastoral.cream, 60), fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.cream, 14), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: '42%', height: '100%', background: pastoral.accentGold, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause/exit */}
      <div style={{ position: 'absolute', top: compact ? 26 : 44, right: compact ? 10 : 18, display: 'flex', gap: 10, alignItems: 'center', zIndex: 4 }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.accentGold} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name="pause" size={18} color={pastoral.cream} />
        </button>
      </div>

      {/* Camera chip */}
      <div style={{ position: 'absolute', bottom: compact ? 100 : 46, left: compact ? 10 : 18, ...hudGlass, padding: '6px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, zIndex: 4 }}>
        <Icon name="compass" size={14} color={pastoral.accentGold} /> Follow
      </div>

      {/* Mobile controls: joystick + sprint */}
      {compact && (
        <>
          <div style={{ position: 'absolute', bottom: 30, left: 18, width: 92, height: 92, borderRadius: '50%', border: `2px solid ${alpha(pastoral.accentGold, 50)}`, background: alpha(pastoral.ink, 40), zIndex: 4 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%', background: alpha(pastoral.cream, 70) }} />
          </div>
          <div style={{ position: 'absolute', bottom: 42, right: 22, width: 68, height: 68, borderRadius: '50%', background: `linear-gradient(180deg, ${pastoral.accentGold} 0%, #c98a3e 100%)`, display: 'grid', placeItems: 'center', color: pastoral.ink, fontWeight: 700, fontSize: 13, boxShadow: `0 6px 18px ${alpha(pastoral.accentGold, 45)}`, zIndex: 4 }}>RUN</div>
        </>
      )}

      {/* Return-to-menu (desktop) */}
      {!compact && (
        <button onClick={flow.exit} style={{ position: 'absolute', bottom: 46, right: 20, ...hudGlass, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, zIndex: 4 }}>
          <Icon name="prev" size={16} color={pastoral.cream} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'warm-cinematic',
  name: 'Warm Cinematic',
  tagline: 'Warm-dark espresso and gold over a vignetted scene.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
