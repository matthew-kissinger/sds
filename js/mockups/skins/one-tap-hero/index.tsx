/**
 * Skin - One-Tap Hero. An alternative flow tuned for the returning player:
 * fewest decisions, one tap to play. Over a full render of the current world,
 * a single giant Play button owns the center-bottom and resumes the last setup
 * (world / mode / dog summarised in a subline). Everything else is a quiet,
 * optional drill-down: small chips reveal an inline world switcher, a difficulty
 * row, and a dog swap row. The hero Play is the star; depth is available but
 * deliberately de-emphasised.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

type Drawer = null | 'world' | 'mode' | 'dog';

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 84),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 18,
  color: pastoral.ink,
  boxShadow: '0 12px 36px rgba(43,38,32,0.26)',
};

/** A quiet pill the player can ignore: the drill-down affordances live here. */
const quietChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '7px 13px',
  borderRadius: 999,
  border: `1px solid ${pastoral.glassWarmBorder}`,
  background: alpha(pastoral.cream, 58),
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  color: pastoral.ink,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const toggle = (d: Drawer) => setDrawer((cur) => (cur === d ? null : d));

  // The resumed setup, summarised under the hero Play.
  const resumeLine = `${flow.world.name} - ${flow.mode.name} - ${flow.dog.name}`;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* Full render of the current world, with a slow drift. */}
      <div style={{ position: 'absolute', inset: 0, animation: flow.reducedMotion ? 'none' : 'mock-kenburns 30s ease-in-out infinite alternate' }}>
        <WorldImage world={flow.world} />
      </div>
      {/* Warm legibility gradient: keeps the title readable up top and the hero
          Play readable below without hiding the scene. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.34) 0%, rgba(43,38,32,0) 24%, rgba(43,38,32,0) 44%, rgba(43,38,32,0.62) 100%)' }} />
      <MoteField count={12} reducedMotion={flow.reducedMotion} />

      {/* Title, small, top-left. The brand is present but the Play is the star. */}
      <div style={{ position: 'absolute', top: compact ? 14 : 22, left: compact ? 16 : 28, right: compact ? 16 : 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 16 : 19, color: pastoral.cream, textShadow: '0 2px 12px rgba(43,38,32,0.55)', letterSpacing: 0.2 }}>
          Sheepdog Simulator
        </div>
        {/* Quiet corner: settings only, so nothing competes with Play. */}
        <button title="Settings" style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: alpha(pastoral.cream, 58), border: `1px solid ${pastoral.glassWarmBorder}`, color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', flexShrink: 0 }}>
          <Icon name="settings" size={17} />
        </button>
      </div>

      {/* Center-bottom hero stack: the inline drawer (when open) sits just above
          the giant Play so a change is visible before you tap. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: compact ? '0 16px calc(20px + env(safe-area-inset-bottom))' : '0 0 34px', gap: 14 }}>

        {/* The optional drill-down surface. Empty by default. */}
        {drawer && (
          <div style={{ ...glass, width: compact ? '100%' : 'min(560px, 92vw)', padding: compact ? '14px 14px' : '16px 18px', animation: flow.reducedMotion ? 'none' : 'mock-rise 240ms cubic-bezier(0.25,0.8,0.35,1)' }}>
            {drawer === 'world' && <WorldDrawer flow={flow} />}
            {drawer === 'mode' && <ModeDrawer flow={flow} />}
            {drawer === 'dog' && <DogDrawer flow={flow} onPick={() => setDrawer(null)} />}
          </div>
        )}

        {/* THE STAR: one giant Play. Resumes the last setup on tap. */}
        <button
          onClick={flow.commit}
          style={{
            width: compact ? '100%' : 'min(560px, 92vw)',
            minHeight: compact ? 76 : 88,
            borderRadius: 22,
            border: 'none',
            cursor: 'pointer',
            background: pastoral.accentMeadow,
            color: pastoral.cream,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '0 24px',
            boxShadow: `0 14px 40px ${alpha(pastoral.accentMeadow, 55)}, 0 2px 0 ${alpha(pastoral.cream, 22)} inset`,
            animation: flow.reducedMotion ? 'none' : 'mock-pulse-soft 3.6s ease-in-out infinite',
          }}
        >
          <span style={{ width: compact ? 48 : 56, height: compact ? 48 : 56, borderRadius: '50%', background: alpha(pastoral.cream, 22), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="play" size={compact ? 26 : 30} color={pastoral.cream} />
          </span>
          <span style={{ textAlign: 'left', minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--mock-display)', fontSize: compact ? 26 : 32, fontWeight: 700, lineHeight: 1.05 }}>Play</span>
            <span style={{ display: 'block', fontSize: compact ? 12 : 13, opacity: 0.92, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeLine}</span>
          </span>
        </button>

        {/* SECONDARY drill-downs. Quiet, optional, tucked under the hero. The dog
            avatar opens the swap row; world/mode are text chips. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 8 : 10, flexWrap: 'wrap', maxWidth: compact ? '100%' : 'min(560px, 92vw)' }}>
          <button onClick={() => toggle('world')} style={{ ...quietChip, ...(drawer === 'world' ? activeChip : null) }} title="Change world">
            <Icon name="compass" size={15} color={pastoral.ink} /> World
          </button>
          <button onClick={() => toggle('mode')} style={{ ...quietChip, ...(drawer === 'mode' ? activeChip : null) }} title="Change difficulty">
            <Icon name="sheep" size={15} color={pastoral.ink} /> {flow.mode.name}
          </button>
          {/* Dog avatar as its own quiet opener. DogAvatar is a div, so wrapping
              it in this single button is valid (no nested interactive). */}
          <button onClick={() => toggle('dog')} style={{ ...quietChip, paddingLeft: 5, ...(drawer === 'dog' ? activeChip : null) }} title="Change dog">
            <DogAvatar dog={flow.dog} size={26} active={drawer === 'dog'} />
            {flow.dog.name.split(' ')[0]}
          </button>
        </div>
      </div>
    </div>
  );
}

const activeChip: CSSProperties = {
  background: alpha(pastoral.cream, 92),
  borderColor: alpha(pastoral.accentMeadow, 60),
  boxShadow: `0 0 0 2px ${alpha(pastoral.accentMeadow, 28)}`,
};

/** Inline world switcher: prev/next plus a dot rail. Quiet by design. */
function WorldDrawer({ flow }: SkinViewProps) {
  const chip: CSSProperties = {
    width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
    border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 5), color: pastoral.ink, cursor: 'pointer',
  };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={flow.prevWorld} title="Previous world" style={chip}><Icon name="prev" size={18} /></button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>{flow.world.name}</div>
          <div style={{ fontSize: 12.5, color: pastoral.inkSoft, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
        </div>
        <button onClick={flow.nextWorld} title="Next world" style={chip}><Icon name="next" size={18} /></button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
        {flow.worlds.map((w, i) => (
          <button
            key={w.id}
            onClick={() => flow.armWorld(w.id)}
            title={w.name}
            style={{ width: i === flow.worldIndex ? 18 : 8, height: 8, padding: 0, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === flow.worldIndex ? pastoral.accentMeadow : alpha(pastoral.ink, 22), transition: 'all 200ms' }}
          />
        ))}
      </div>
    </div>
  );
}

/** Inline difficulty row via flow.setMode. The chosen mode rides up into Play. */
function ModeDrawer({ flow }: SkinViewProps) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
      {flow.modes.map((m) => {
        const active = m.id === flow.mode.id;
        return (
          <button key={m.id} onClick={() => flow.setMode(m.id)} style={{
            flexShrink: 0, padding: '9px 13px', borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
            background: active ? pastoral.accentMeadow : alpha(pastoral.ink, 5),
            color: active ? pastoral.cream : pastoral.ink, textAlign: 'left', minWidth: 92,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
            <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Icon name="sheep" size={12} color={active ? pastoral.cream : pastoral.inkSoft} /> {formatSheep(m.sheep)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Inline dog swap row via flow.setDog. Picking one closes the drawer. */
function DogDrawer({ flow, onPick }: SkinViewProps & { onPick: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
      {flow.dogs.map((d) => {
        const active = d.id === flow.dog.id;
        return (
          <button
            key={d.id}
            onClick={() => { flow.setDog(d.id); onPick(); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: active ? pastoral.ink : pastoral.inkSoft }}
          >
            <DogAvatar dog={d} size={46} active={active} />
            <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 500 }}>{d.name.split(' ')[0]}</span>
          </button>
        );
      })}
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* The target world's backdrop, softened behind a calm bar. */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', transform: 'scale(1.05)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 40) }} />
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
  const pennedPct = total > 0 ? Math.round((penned / total) * 100) : 0;
  const hudGlass: CSSProperties = {
    background: alpha(pastoral.cream, 82), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${pastoral.glassWarmBorder}`, borderRadius: 14, color: pastoral.ink,
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.25) 0%, rgba(43,38,32,0) 30%)' }} />

      {/* Top-left: sheep penned / total + progress. */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 168 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pennedPct}%`, height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause (exit). */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, right: compact ? 10 : 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.ink} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name="pause" size={18} color={pastoral.ink} />
        </button>
      </div>

      {/* Camera chip. */}
      <div style={{ position: 'absolute', bottom: compact ? 100 : 20, left: compact ? 10 : 18, ...hudGlass, padding: '6px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="compass" size={14} color={pastoral.ink} /> Follow
      </div>

      {/* Compact: joystick + sprint. */}
      {compact && (
        <>
          <div style={{ position: 'absolute', bottom: 24, left: 18, width: 92, height: 92, borderRadius: '50%', border: `2px solid ${alpha(pastoral.cream, 60)}`, background: alpha(pastoral.ink, 18) }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%', background: alpha(pastoral.cream, 70) }} />
          </div>
          <div style={{ position: 'absolute', bottom: 36, right: 22, width: 68, height: 68, borderRadius: '50%', background: alpha(pastoral.accentMeadow, 82), display: 'grid', placeItems: 'center', color: pastoral.cream, fontWeight: 700, fontSize: 13 }}>RUN</div>
        </>
      )}

      {/* Desktop: return to menu. */}
      {!compact && (
        <button onClick={flow.exit} style={{ position: 'absolute', bottom: 20, right: 20, ...hudGlass, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <Icon name="prev" size={16} color={pastoral.ink} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'one-tap-hero',
  name: 'One-Tap Hero',
  tagline: 'One giant Play resumes last; everything else is a drill-down.',
  flowKind: 'one-tap',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
