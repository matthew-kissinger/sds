/**
 * Skin - Launcher. A tidy, modern, app-like game launcher dashboard. Not a
 * carousel: the whole structure is on screen at once. A top bar (title left,
 * round icon buttons right), a horizontal strip of the three worlds as
 * selectable thumbnail cards, and a clean warm-glass content panel for the
 * armed world: difficulty as a segmented control, the dog as an avatar with a
 * change affordance, and a prominent Play. Gridded, calm, cohesive. Leans on
 * the shared icon system as the visual signature.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar } from '../../shell/components';
import { Icon, type IconName } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/** Cohesive warm backdrop: a soft pastoral gradient with the armed world's
 *  render dropped in heavily blurred + dimmed, so the dashboard reads as one
 *  surface tinted by where you are about to play, never as a photo wallpaper. */
function LauncherBackdrop({ flow }: SkinViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, var(--color-pasture-dawn) 0%, var(--color-pasture-gold) 48%, var(--color-pasture-horizon) 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(46px) saturate(1.05)', transform: 'scale(1.18)', opacity: 0.5 }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.cream, 30) }} />
    </div>
  );
}

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 84),
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 12px 38px rgba(43,38,32,0.18)',
};

/** A round icon button for the top bar. Presentational shell; the caller wires
 *  onClick + title so we never nest interactives. */
function RoundButton({
  name, title, onClick, size = 42,
}: { name: IconName; title: string; onClick?: () => void; size?: number }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: alpha(pastoral.cream, 78), border: `1px solid ${pastoral.glassWarmBorder}`,
        color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)', flexShrink: 0,
        boxShadow: '0 2px 8px rgba(43,38,32,0.10)',
      }}
    >
      <Icon name={name} size={Math.round(size * 0.46)} />
    </button>
  );
}

function TopBar({ flow, compact }: SkinViewProps & { compact: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: compact ? '14px 14px' : '18px 22px',
    }}>
      {/* Title / logo cluster, left. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: compact ? 38 : 44, height: compact ? 38 : 44, borderRadius: 14, flexShrink: 0,
          background: pastoral.accentMeadow, display: 'grid', placeItems: 'center',
          boxShadow: `0 4px 14px ${alpha(pastoral.accentMeadow, 45)}`,
        }}>
          <Icon name="dog" size={compact ? 22 : 26} color={pastoral.cream} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 17 : 21, lineHeight: 1.05, color: pastoral.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Sheepdog Simulator
          </div>
          {!compact && (
            <div style={{ fontSize: 12, color: pastoral.inkSoft, marginTop: 2 }}>Pick a world. Pick a dog. Go.</div>
          )}
        </div>
      </div>

      {/* Round icon buttons, right, with a small dog "profile" avatar. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <RoundButton name="trophy" title="Leaderboard" onClick={flow.commit} size={compact ? 38 : 42} />
        <RoundButton name="settings" title="Settings" size={compact ? 38 : 42} />
        <div title={`Profile: ${flow.dog.name}`} style={{ display: 'grid', placeItems: 'center' }}>
          <DogAvatar dog={flow.dog} size={compact ? 38 : 42} active ring={pastoral.accentMeadow} />
        </div>
      </div>
    </div>
  );
}

/** The horizontal strip of selectable world thumbnail cards. Clicking arms. */
function WorldStrip({ flow, compact }: SkinViewProps & { compact: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? 8 : 12,
    }}>
      {flow.worlds.map((w) => {
        const armed = w.id === flow.world.id;
        return (
          <button
            key={w.id}
            onClick={() => flow.armWorld(w.id)}
            title={w.name}
            style={{
              position: 'relative', padding: 0, cursor: 'pointer', textAlign: 'left',
              borderRadius: 16, overflow: 'hidden', height: compact ? 78 : 116,
              border: `2px solid ${armed ? w.accent : 'transparent'}`,
              boxShadow: armed
                ? `0 8px 22px ${alpha(w.accent, 40)}, 0 0 0 3px ${alpha(w.accent, 22)}`
                : '0 3px 12px rgba(43,38,32,0.16)',
              transform: armed ? 'translateY(-2px)' : 'none',
              transition: 'transform 200ms, box-shadow 200ms, border-color 200ms',
              background: w.gradient,
            }}
          >
            <WorldImage world={w} radius={0} overlay={armed
              ? 'linear-gradient(180deg, rgba(43,38,32,0) 30%, rgba(43,38,32,0.62) 100%)'
              : 'linear-gradient(180deg, rgba(43,38,32,0.12) 0%, rgba(43,38,32,0.5) 100%)'} />
            {/* Armed check, top-right. */}
            {armed && (
              <div style={{
                position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: '50%',
                background: w.accent, display: 'grid', placeItems: 'center',
                boxShadow: '0 2px 6px rgba(43,38,32,0.3)',
              }}>
                <Icon name="check" size={13} color={pastoral.cream} />
              </div>
            )}
            <div style={{ position: 'absolute', left: compact ? 8 : 11, right: 8, bottom: compact ? 6 : 9 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 13 : 16, color: pastoral.cream, lineHeight: 1.1, textShadow: '0 1px 6px rgba(43,38,32,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {w.name}
              </div>
              {!compact && (
                <div style={{ fontSize: 11, color: alpha(pastoral.cream, 88), marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(43,38,32,0.6)' }}>
                  {w.tagline}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Difficulty as a connected segmented control. Active segment filled meadow. */
function ModeSegments({ flow, compact }: SkinViewProps & { compact: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${flow.modes.length}, 1fr)`,
      borderRadius: 14, overflow: 'hidden', border: `1px solid ${pastoral.glassWarmBorder}`,
      background: alpha(pastoral.ink, 5),
    }}>
      {flow.modes.map((m, i) => {
        const active = m.id === flow.mode.id;
        return (
          <button
            key={m.id}
            onClick={() => flow.setMode(m.id)}
            title={m.blurb}
            style={{
              padding: compact ? '9px 4px' : '11px 6px', cursor: 'pointer', textAlign: 'center',
              border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${active ? 'transparent' : alpha(pastoral.ink, 12)}`,
              background: active ? pastoral.accentMeadow : 'transparent',
              color: active ? pastoral.cream : pastoral.ink,
              transition: 'background 180ms, color 180ms',
            }}
          >
            <div style={{ fontSize: compact ? 11 : 12.5, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
            <div style={{ fontSize: compact ? 9.5 : 11, opacity: active ? 0.92 : 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 3 }}>
              <Icon name="sheep" size={compact ? 10 : 12} color={active ? pastoral.cream : pastoral.inkSoft} />
              {formatSheep(m.sheep)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);
  const ranked = flow.mode.ranked;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <LauncherBackdrop flow={flow} />

      {/* The dashboard column: top bar, world strip, content panel. Centered,
          capped width on desktop; full-bleed scrollable on compact. */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', overflowY: 'auto',
      }}>
        <div style={{
          width: '100%', maxWidth: compact ? '100%' : 760, display: 'flex', flexDirection: 'column',
          gap: compact ? 12 : 16, padding: compact
            ? '0 14px calc(18px + env(safe-area-inset-bottom))'
            : '8px 24px 28px',
          boxSizing: 'border-box',
        }}>
          <TopBar flow={flow} compact={compact} />
          <WorldStrip flow={flow} compact={compact} />

          {/* Content panel for the armed world. */}
          <div style={{ ...glass, padding: compact ? '16px 14px' : '20px 22px', display: 'flex', flexDirection: 'column', gap: compact ? 14 : 16 }}>
            {/* Panel header: armed world identity + ranked badge. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 21 : 25, fontWeight: 600, lineHeight: 1.1, color: pastoral.ink }}>{flow.world.name}</div>
                <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
              </div>
              <div style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: ranked ? alpha(flow.world.accent, 18) : alpha(pastoral.ink, 7),
                color: ranked ? pastoral.ink : pastoral.inkSoft,
                border: `1px solid ${ranked ? alpha(flow.world.accent, 36) : pastoral.glassWarmBorder}`,
              }}>
                <Icon name="trophy" size={13} color={ranked ? pastoral.ink : pastoral.inkSoft} />
                {ranked ? 'Ranked' : 'Casual'}
              </div>
            </div>

            {/* Difficulty segmented control. */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: pastoral.inkSoft, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Difficulty</div>
              <ModeSegments flow={flow} compact={compact} />
              <div style={{ fontSize: 12.5, color: pastoral.inkSoft, marginTop: 8 }}>{flow.mode.blurb}</div>
            </div>

            {/* Dog avatar + change affordance + Play, gridded. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: compact ? 'wrap' : 'nowrap' }}>
              <button
                onClick={() => setDogOpen((o) => !o)}
                title="Change dog"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 5, paddingRight: 14,
                  borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`,
                  background: alpha(pastoral.ink, 4), cursor: 'pointer', color: pastoral.ink, flexShrink: 0,
                }}
              >
                <DogAvatar dog={flow.dog} size={44} active ring={pastoral.accentMeadow} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.dog.name}</div>
                  <div style={{ fontSize: 11, color: pastoral.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {flow.dog.trait} <Icon name={dogOpen ? 'close' : 'next'} size={11} color={pastoral.inkSoft} /> {dogOpen ? '' : 'change'}
                  </div>
                </div>
              </button>
              <button
                onClick={flow.commit}
                style={{
                  flex: 1, minWidth: compact ? '100%' : 180, height: 54, borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: pastoral.accentMeadow, color: pastoral.cream, fontSize: 18, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  boxShadow: `0 6px 20px ${alpha(pastoral.accentMeadow, 48)}`,
                }}
              >
                <Icon name="play" size={20} /> Play
              </button>
            </div>

            {/* Dog swap row, revealed under the change affordance. */}
            {dogOpen && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
                padding: compact ? '12px 4px' : '12px 8px', borderRadius: 14,
                background: alpha(pastoral.ink, 4), border: `1px solid ${pastoral.glassWarmBorder}`,
              }}>
                {flow.dogs.map((d) => {
                  const on = d.id === flow.dog.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => { flow.setDog(d.id); setDogOpen(false); }}
                      title={`${d.name} - ${d.trait}`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: on ? pastoral.ink : pastoral.inkSoft,
                      }}
                    >
                      <DogAvatar dog={d} size={compact ? 40 : 46} active={on} ring={pastoral.accentMeadow} />
                      <span style={{ fontSize: 11, fontWeight: on ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{d.name.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Secondary ways to play, as a quiet footer row of icon links. */}
            <div style={{ display: 'flex', gap: compact ? 14 : 20, justifyContent: 'center', flexWrap: 'wrap', paddingTop: 4, borderTop: `1px solid ${alpha(pastoral.ink, 8)}` }}>
              {flow.ways.map((w) => (
                <button
                  key={w.id}
                  onClick={flow.commit}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: pastoral.inkSoft, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, paddingTop: 8 }}
                >
                  <Icon name={w.id === 'online' ? 'users' : w.id === 'sandbox' ? 'sandbox' : 'local'} size={15} /> {w.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* Target world's backdrop, softly blurred, behind a calm bar. */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px)', transform: 'scale(1.06)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 36) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...glass, padding: compact ? '24px 22px' : '30px 28px', width: 'min(460px, 92%)' }}>
          {/* A small launcher-style header row keeps the dashboard identity. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, overflow: 'hidden', border: `1px solid ${pastoral.glassWarmBorder}` }}>
              <div style={{ position: 'relative', width: '100%', height: '100%' }}><WorldImage world={flow.world} /></div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600, lineHeight: 1.1, color: pastoral.ink }}>{flow.world.name}</div>
              <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="dog" size={13} color={pastoral.inkSoft} /> {flow.dog.name}
                <span style={{ opacity: 0.5 }}>·</span> {flow.mode.name}
              </div>
            </div>
          </div>
          <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentMeadow} width={460} />
        </div>
      </div>
    </div>
  );
}

const hudGlass: CSSProperties = {
  background: alpha(pastoral.cream, 82),
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 14,
  color: pastoral.ink,
  boxShadow: '0 4px 16px rgba(43,38,32,0.14)',
};

function InGameView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const total = flow.mode.sheep;
  const penned = Math.round(total * 0.42);
  const pct = Math.round((penned / total) * 100);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.22) 0%, rgba(43,38,32,0) 26%)' }} />

      {/* Top-left: sheep penned / total + progress. Tidy cornered card. */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 176 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: pastoral.inkSoft }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause, matched corner card. */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, right: compact ? 10 : 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.ink} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name="pause" size={18} color={pastoral.ink} />
        </button>
      </div>

      {/* Bottom-left: camera chip. */}
      <div style={{ position: 'absolute', bottom: compact ? 124 : 20, left: compact ? 10 : 18, ...hudGlass, padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <Icon name="compass" size={14} color={pastoral.ink} /> Follow
      </div>

      {/* Compact: joystick + sprint. */}
      {compact && (
        <>
          <div style={{ position: 'absolute', bottom: 28, left: 18, width: 96, height: 96, borderRadius: '50%', border: `2px solid ${alpha(pastoral.cream, 60)}`, background: alpha(pastoral.ink, 18), backdropFilter: 'blur(2px)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: '50%', background: alpha(pastoral.cream, 72), boxShadow: '0 2px 8px rgba(43,38,32,0.3)' }} />
          </div>
          <button title="Sprint" style={{ position: 'absolute', bottom: 40, right: 22, width: 70, height: 70, borderRadius: '50%', border: 'none', cursor: 'pointer', background: alpha(pastoral.accentMeadow, 88), display: 'grid', placeItems: 'center', color: pastoral.cream, fontWeight: 700, fontSize: 13, boxShadow: `0 6px 18px ${alpha(pastoral.accentMeadow, 50)}` }}>
            RUN
          </button>
        </>
      )}

      {/* Desktop: return-to-menu. */}
      {!compact && (
        <button onClick={flow.exit} style={{ position: 'absolute', bottom: 20, right: 20, ...hudGlass, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <Icon name="prev" size={16} color={pastoral.ink} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'launcher',
  name: 'Launcher',
  tagline: 'A tidy warm-glass game launcher dashboard.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
