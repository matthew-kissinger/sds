/**
 * Skin - Zen Type. The calm extreme: a near-imageless, typography-led menu.
 * world-first, but the world is announced as a book title set very large in the
 * display serif on a still pastoral wash, not shown as a photo. The only imagery
 * is one small rounded scene chip beside the title. Difficulty is quiet inline
 * text, the dog is a small avatar with a name, and Play is an understated pill.
 * Maximum whitespace, fastest-reading. The opposite of a busy UI.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/**
 * The shared still wash: a soft pastoral gradient (dawn -> gold -> cream) that
 * carries every view. No photo, no motion in the gradient itself. A single faint
 * mote drift is the only animation, and it stills on reduced motion.
 */
const WASH: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: `linear-gradient(168deg, ${pastoral.pastureDawn} 0%, ${pastoral.pastureGold} 48%, ${pastoral.cream} 100%)`,
};

/** A quiet serif arrow button for prev/next world. Ghosted, no fill. */
function SerifArrow({
  dir, onClick, large = false,
}: { dir: 'prev' | 'next'; onClick: () => void; large?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={dir === 'prev' ? 'Previous world' : 'Next world'}
      aria-label={dir === 'prev' ? 'Previous world' : 'Next world'}
      style={{
        fontFamily: 'var(--mock-display)',
        fontSize: large ? 40 : 30,
        lineHeight: 1,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: alpha(pastoral.ink, 38),
        padding: large ? '8px 14px' : '6px 10px',
        transition: 'color 200ms',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = pastoral.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.color = alpha(pastoral.ink, 38))}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

  const titleSize = compact ? 'clamp(40px, 16vw, 68px)' : 'clamp(64px, 9vw, 132px)';

  return (
    <div
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        fontFamily: 'var(--mock-text)', color: pastoral.ink,
      }}
    >
      <div style={WASH} />
      {/* The single, very faint mote drift - the only motion on the page. */}
      <MoteField count={6} reducedMotion={flow.reducedMotion} color={alpha(pastoral.ink, 18)} />

      {/* Centered single column. Maximum whitespace; everything reads top-down. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center',
          padding: compact ? '40px 24px calc(40px + env(safe-area-inset-bottom))' : '64px 48px',
          gap: compact ? 22 : 30,
        }}
      >
        {/* Small scene chip - the only imagery on the page. */}
        <div
          key={flow.world.id}
          style={{
            position: 'relative',
            width: compact ? 92 : 120, height: compact ? 92 : 120,
            borderRadius: 20, overflow: 'hidden', flexShrink: 0,
            border: `1px solid ${pastoral.glassWarmBorder}`,
            boxShadow: '0 8px 24px rgba(43,38,32,0.16)',
            animation: flow.reducedMotion ? 'none' : 'mock-fade-in 420ms ease',
          }}
        >
          <WorldImage world={flow.world} radius={20} />
        </div>

        {/* The book-title block: big serif name, small tagline, serif arrows. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 18, maxWidth: '100%' }}>
          {!compact && <SerifArrow dir="prev" onClick={flow.prevWorld} large />}
          <div style={{ minWidth: 0 }}>
            <h1
              key={flow.world.id}
              style={{
                fontFamily: 'var(--mock-display)',
                fontWeight: 600,
                fontSize: titleSize,
                lineHeight: 1.02,
                letterSpacing: '-0.015em',
                margin: 0,
                color: pastoral.ink,
                animation: flow.reducedMotion ? 'none' : 'mock-fade-in 420ms ease',
              }}
            >
              {flow.world.name}
            </h1>
            <p
              style={{
                fontFamily: 'var(--mock-text)',
                fontSize: compact ? 14 : 16,
                color: pastoral.inkSoft,
                margin: `${compact ? 8 : 12}px 0 0`,
                fontStyle: 'italic',
                letterSpacing: '0.01em',
              }}
            >
              {flow.world.tagline}
            </p>
          </div>
          {!compact && <SerifArrow dir="next" onClick={flow.nextWorld} large />}
        </div>

        {/* Compact world-switch row: arrows flank a quiet position dot strip. */}
        {compact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SerifArrow dir="prev" onClick={flow.prevWorld} />
            <div style={{ display: 'flex', gap: 7 }}>
              {flow.worlds.map((w, i) => (
                <span
                  key={w.id}
                  style={{
                    width: i === flow.worldIndex ? 16 : 6, height: 6, borderRadius: 999,
                    background: i === flow.worldIndex ? pastoral.ink : alpha(pastoral.ink, 22),
                    transition: 'all 200ms',
                  }}
                />
              ))}
            </div>
            <SerifArrow dir="next" onClick={flow.nextWorld} />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 7 }}>
            {flow.worlds.map((w, i) => (
              <span
                key={w.id}
                style={{
                  width: i === flow.worldIndex ? 16 : 6, height: 6, borderRadius: 999,
                  background: i === flow.worldIndex ? pastoral.ink : alpha(pastoral.ink, 22),
                  transition: 'all 200ms',
                }}
              />
            ))}
          </div>
        )}

        {/* Difficulty as quiet inline text. Active in ink, the rest ghosted. */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            alignItems: 'baseline', gap: compact ? '10px 16px' : '10px 26px',
            maxWidth: 560,
          }}
        >
          {flow.modes.map((m) => {
            const active = m.id === flow.mode.id;
            return (
              <button
                key={m.id}
                onClick={() => flow.setMode(m.id)}
                title={`${m.name} - ${formatSheep(m.sheep)} sheep`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--mock-text)',
                  fontSize: compact ? 15 : 16,
                  fontWeight: active ? 600 : 400,
                  color: active ? pastoral.accentMeadow : alpha(pastoral.ink, 45),
                  borderBottom: `1px solid ${active ? pastoral.accentMeadow : 'transparent'}`,
                  paddingBottom: 2,
                  transition: 'color 180ms',
                  letterSpacing: '0.005em',
                }}
              >
                {m.name}
                <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 5 }}>{formatSheep(m.sheep)}</span>
              </button>
            );
          })}
        </div>

        {/* Dog (small avatar + name) and Play (quiet pill), on one calm row. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: compact ? 18 : 28, flexWrap: 'wrap', marginTop: compact ? 2 : 6,
          }}
        >
          <button
            onClick={() => setDogOpen((o) => !o)}
            title="Change dog"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: pastoral.ink,
            }}
          >
            <DogAvatar dog={flow.dog} size={34} active ring={pastoral.accentMeadow} />
            <span style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 17 : 19 }}>{flow.dog.name}</span>
          </button>

          <button
            onClick={flow.commit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: compact ? '11px 30px' : '13px 38px',
              borderRadius: 999,
              border: `1px solid ${pastoral.ink}`,
              background: 'transparent',
              color: pastoral.ink,
              fontFamily: 'var(--mock-display)',
              fontSize: compact ? 17 : 19,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'background 200ms, color 200ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = pastoral.ink;
              e.currentTarget.style.color = pastoral.cream;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = pastoral.ink;
            }}
          >
            <Icon name="play" size={16} /> Play
          </button>
        </div>

        {/* Quiet dog swap row, only when invited. */}
        {dogOpen && (
          <div
            style={{
              display: 'flex', gap: compact ? 14 : 18, flexWrap: 'wrap', justifyContent: 'center',
              animation: flow.reducedMotion ? 'none' : 'mock-fade-in 260ms ease',
            }}
          >
            {flow.dogs.map((d) => (
              <button
                key={d.id}
                onClick={() => { flow.setDog(d.id); setDogOpen(false); }}
                title={d.name}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer', color: pastoral.ink,
                }}
              >
                <DogAvatar dog={d} size={40} active={d.id === flow.dog.id} ring={pastoral.accentMeadow} />
                <span style={{ fontSize: 12, color: d.id === flow.dog.id ? pastoral.ink : pastoral.inkSoft }}>
                  {d.name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Secondary ways to play, as the quietest text links of all. */}
        <div style={{ display: 'flex', gap: compact ? 16 : 22, justifyContent: 'center', flexWrap: 'wrap' }}>
          {flow.ways.map((w) => (
            <button
              key={w.id}
              onClick={flow.commit}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: alpha(pastoral.ink, 42), fontSize: 13,
                fontFamily: 'var(--mock-text)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'color 180ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = pastoral.inkSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.color = alpha(pastoral.ink, 42))}
            >
              <Icon name={w.id === 'online' ? 'users' : w.id === 'sandbox' ? 'sandbox' : 'local'} size={13} /> {w.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        fontFamily: 'var(--mock-text)', color: pastoral.ink,
      }}
    >
      {/* The target world's backdrop, very softly behind the calm wash. */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px)', transform: 'scale(1.06)', opacity: 0.5 }}>
        <WorldImage world={flow.world} />
      </div>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(168deg, ${alpha(pastoral.pastureDawn, 78)} 0%, ${alpha(pastoral.pastureGold, 78)} 48%, ${alpha(pastoral.cream, 86)} 100%)`,
        }}
      />

      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: 32, gap: 26,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--mock-display)', fontWeight: 600,
              fontSize: 'clamp(40px, 7vw, 84px)', lineHeight: 1.05, letterSpacing: '-0.015em',
              margin: 0, color: pastoral.ink,
            }}
          >
            {flow.world.name}
          </h1>
          <p style={{ fontSize: 14, color: pastoral.inkSoft, margin: '12px 0 0', fontStyle: 'italic' }}>
            {flow.dog.name} . {flow.mode.name}
          </p>
        </div>
        <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentMeadow} width={300} />
      </div>
    </div>
  );
}

function InGameView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const total = flow.mode.sheep;
  const penned = Math.round(total * 0.42);
  const pennedPct = Math.round((penned / total) * 100);

  // Minimal, typographic counters. No glass panels - just type over the world,
  // with a soft top scrim for legibility, keeping the calm reading posture.
  const counterWrap: CSSProperties = {
    position: 'absolute', display: 'flex', alignItems: 'baseline', gap: 7,
    color: pastoral.cream, textShadow: '0 1px 10px rgba(43,38,32,0.6)',
    fontFamily: 'var(--mock-display)',
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        fontFamily: 'var(--mock-text)',
      }}
    >
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.34) 0%, rgba(43,38,32,0) 24%, rgba(43,38,32,0) 78%, rgba(43,38,32,0.3) 100%)' }} />

      {/* Top-left: sheep penned / total as a single typographic readout. */}
      <div style={{ ...counterWrap, top: compact ? 12 : 20, left: compact ? 14 : 24 }}>
        <Icon name="sheep" size={compact ? 18 : 20} color={pastoral.cream} style={{ alignSelf: 'center' }} />
        <span style={{ fontSize: compact ? 24 : 30, fontWeight: 600, lineHeight: 1 }}>{formatSheep(penned)}</span>
        <span style={{ fontSize: compact ? 14 : 16, opacity: 0.8 }}>/ {formatSheep(total)}</span>
        <span style={{ fontFamily: 'var(--mock-text)', fontSize: 12, opacity: 0.7, marginLeft: 2 }}>{pennedPct}%</span>
      </div>

      {/* Top-right: timer (typographic) + a quiet pause/exit affordance. */}
      <div style={{ position: 'absolute', top: compact ? 12 : 20, right: compact ? 14 : 24, display: 'flex', alignItems: 'center', gap: compact ? 12 : 16 }}>
        <div style={{ ...counterWrap, position: 'static' }}>
          <span style={{ fontSize: compact ? 22 : 28, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>02:14</span>
        </div>
        <button
          onClick={flow.exit}
          title="Pause"
          aria-label="Pause"
          style={{
            width: 38, height: 38, display: 'grid', placeItems: 'center',
            background: alpha(pastoral.ink, 30), border: `1px solid ${alpha(pastoral.cream, 35)}`,
            borderRadius: 999, color: pastoral.cream, cursor: 'pointer',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <Icon name="pause" size={17} color={pastoral.cream} />
        </button>
      </div>

      {/* Camera chip, kept as a minimal typographic tag. */}
      <div
        style={{
          position: 'absolute', bottom: compact ? 104 : 22, left: compact ? 14 : 24,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: pastoral.cream, textShadow: '0 1px 8px rgba(43,38,32,0.6)',
          fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}
      >
        <Icon name="compass" size={14} color={pastoral.cream} /> Follow
      </div>

      {/* Mobile controls: joystick + sprint, drawn light to stay calm. */}
      {compact && (
        <>
          <div
            style={{
              position: 'absolute', bottom: 26, left: 20, width: 92, height: 92, borderRadius: '50%',
              border: `2px solid ${alpha(pastoral.cream, 55)}`, background: alpha(pastoral.ink, 16),
            }}
          >
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: '50%', background: alpha(pastoral.cream, 68) }} />
          </div>
          <div
            style={{
              position: 'absolute', bottom: 38, right: 22, width: 66, height: 66, borderRadius: '50%',
              border: `1px solid ${alpha(pastoral.cream, 45)}`, background: alpha(pastoral.ink, 28),
              display: 'grid', placeItems: 'center', color: pastoral.cream,
              fontFamily: 'var(--mock-display)', fontSize: 14, letterSpacing: '0.05em',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            RUN
          </div>
        </>
      )}

      {/* Desktop return-to-menu, the quietest text link. */}
      {!compact && (
        <button
          onClick={flow.exit}
          style={{
            position: 'absolute', bottom: 22, right: 24,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'none', border: 'none', cursor: 'pointer',
            color: pastoral.cream, textShadow: '0 1px 8px rgba(43,38,32,0.6)',
            fontFamily: 'var(--mock-display)', fontSize: 15,
          }}
        >
          <Icon name="prev" size={15} color={pastoral.cream} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'zen-type',
  name: 'Zen Type',
  tagline: 'Calm typographic menu, almost no imagery.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
