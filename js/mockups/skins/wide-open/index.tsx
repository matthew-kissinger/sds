/**
 * Skin - Wide-Open. The "world carries it" extreme: the armed world render
 * fills the entire frame, edge to edge, and the UI is a whisper. A thin light
 * title top-left, a single slim translucent bar pinned to the bottom holding
 * everything in one row (world arrows, name, a difficulty chip that cycles, a
 * small dog avatar, Play), and a vertical dot strip on the right for the three
 * worlds. In-game is ultra-minimal: tiny corner counters only. The thesis under
 * test is restraint - how little chrome the scene can carry and still feel like
 * a menu.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/** The soft bottom-to-clear scrim that buys legibility for the bottom bar. */
const LEGIBILITY_GRADIENT =
  'linear-gradient(180deg, rgba(43,38,32,0) 0%, rgba(43,38,32,0) 48%, rgba(43,38,32,0.16) 70%, rgba(43,38,32,0.62) 100%)';

/** The whisper of chrome: a barely-there translucent surface, not a panel. */
const whisper: CSSProperties = {
  background: alpha(pastoral.scrimWarm, 46),
  backdropFilter: 'blur(14px) saturate(1.05)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
  border: `1px solid ${alpha(pastoral.cream, 16)}`,
  color: pastoral.cream,
};

/** A round, ghost-on-scene control. The arrows and the avatar pill share it. */
const ghostRound: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
  border: `1px solid ${alpha(pastoral.cream, 22)}`,
  background: alpha(pastoral.cream, 10),
  color: pastoral.cream,
  cursor: 'pointer',
};

/** Light, scene-shadowed wordmark. Sits over the render with no plate. */
function Title({ compact }: { compact: boolean }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mock-display)',
        fontWeight: 400,
        letterSpacing: 0.3,
        fontSize: compact ? 17 : 22,
        color: pastoral.cream,
        textShadow: '0 1px 2px rgba(43,38,32,0.55), 0 3px 18px rgba(43,38,32,0.45)',
        lineHeight: 1.1,
      }}
    >
      Sheepdog Simulator
    </div>
  );
}

/** Vertical dot strip on the right edge: the three worlds, current one long. */
function WorldDots({ flow }: { flow: SkinViewProps['flow'] }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        zIndex: 3,
      }}
    >
      {flow.worlds.map((w, i) => {
        const active = i === flow.worldIndex;
        return (
          <button
            key={w.id}
            onClick={() => flow.armWorld(w.id)}
            title={w.name}
            aria-label={w.name}
            style={{
              width: 8,
              height: active ? 22 : 8,
              borderRadius: 999,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              background: active ? pastoral.cream : alpha(pastoral.cream, 38),
              boxShadow: active ? '0 1px 6px rgba(43,38,32,0.5)' : 'none',
              transition: 'height 220ms cubic-bezier(0.25,0.8,0.35,1), background 220ms',
            }}
          />
        );
      })}
    </div>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

  // Compact difficulty selector: a single chip that cycles through the ladder,
  // showing name + sheep count. Keeps the bottom bar to one row on every width.
  const cycleMode = () => {
    const i = flow.modes.findIndex((m) => m.id === flow.mode.id);
    const next = flow.modes[(i + 1) % flow.modes.length];
    flow.setMode(next.id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* The world owns the whole frame, with a slow ken-burns drift. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          animation: flow.reducedMotion ? 'none' : 'mock-kenburns 30s ease-in-out infinite alternate',
        }}
      >
        <WorldImage world={flow.world} />
      </div>
      {/* Only legibility help: a soft bottom gradient. No top plate. */}
      <div style={{ position: 'absolute', inset: 0, background: LEGIBILITY_GRADIENT, pointerEvents: 'none' }} />

      {/* Top-left: the thin title, nothing else. */}
      <div style={{ position: 'absolute', top: compact ? 16 : 22, left: compact ? 16 : 26, zIndex: 3 }}>
        <Title compact={compact} />
      </div>

      {/* Right edge: world dot strip (hidden on compact to keep the scene clean). */}
      {!compact && <WorldDots flow={flow} />}

      {/* The one slim bar, pinned bottom-centre, holding the whole flow. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          padding: compact ? 0 : '0 0 22px',
          zIndex: 4,
        }}
      >
        <div
          style={{
            ...whisper,
            width: compact ? '100%' : 'min(760px, 94%)',
            borderRadius: compact ? '18px 18px 0 0' : 999,
            padding: compact
              ? '10px 12px calc(10px + env(safe-area-inset-bottom))'
              : '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: compact ? 8 : 12,
            animation: flow.reducedMotion ? 'none' : 'mock-rise 380ms cubic-bezier(0.25,0.8,0.35,1)',
          }}
        >
          {/* Prev / world name / next */}
          <button onClick={flow.prevWorld} title="Previous world" aria-label="Previous world" style={ghostRound}>
            <Icon name="prev" size={18} />
          </button>
          <div style={{ minWidth: 0, flexShrink: 1, width: compact ? 'auto' : 150, textAlign: compact ? 'left' : 'center' }}>
            <div
              style={{
                fontFamily: 'var(--mock-display)',
                fontSize: compact ? 16 : 19,
                fontWeight: 500,
                lineHeight: 1.05,
                color: pastoral.cream,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {flow.world.name}
            </div>
            {!compact && (
              <div
                style={{
                  fontSize: 11,
                  color: alpha(pastoral.cream, 72),
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {flow.world.tagline}
              </div>
            )}
          </div>
          <button onClick={flow.nextWorld} title="Next world" aria-label="Next world" style={ghostRound}>
            <Icon name="next" size={18} />
          </button>

          {/* Hairline divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: alpha(pastoral.cream, 18), margin: '2px 0' }} />

          {/* Difficulty: one chip that cycles, showing name + sheep count. */}
          <button
            onClick={cycleMode}
            title="Cycle difficulty"
            aria-label={`Difficulty: ${flow.mode.name}, ${formatSheep(flow.mode.sheep)} sheep. Tap to change.`}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 14px',
              borderRadius: 999,
              border: `1px solid ${alpha(pastoral.cream, 22)}`,
              background: alpha(pastoral.cream, 10),
              color: pastoral.cream,
              cursor: 'pointer',
            }}
          >
            <div style={{ textAlign: 'left', lineHeight: 1.05 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.mode.name}</div>
              <div style={{ fontSize: 10.5, color: alpha(pastoral.cream, 72), display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                <Icon name="sheep" size={11} color={alpha(pastoral.cream, 72)} /> {formatSheep(flow.mode.sheep)}
              </div>
            </div>
          </button>

          {/* Small dog avatar: tap toggles a swap row above the bar. */}
          <button
            onClick={() => setDogOpen((o) => !o)}
            title={`Dog: ${flow.dog.name}. Tap to swap.`}
            aria-label={`Dog: ${flow.dog.name}. Tap to swap.`}
            aria-expanded={dogOpen}
            style={{ ...ghostRound, padding: 0, border: 'none', background: 'transparent', position: 'relative' }}
          >
            <DogAvatar dog={flow.dog} size={38} active ring={pastoral.cream} />
          </button>

          {/* Spacer pushes Play to the right on desktop. */}
          {!compact && <div style={{ flex: 1 }} />}

          {/* Play */}
          <button
            onClick={flow.commit}
            title="Play"
            style={{
              flexShrink: 0,
              height: 40,
              padding: compact ? '0 16px' : '0 24px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: pastoral.accentMeadow,
              color: pastoral.cream,
              fontSize: compact ? 15 : 16,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: `0 4px 16px ${alpha(pastoral.accentMeadow, 50)}`,
            }}
          >
            <Icon name="play" size={18} /> Play
          </button>

          {/* Dog swap row: floats just above the bar so the bar stays one row. */}
          {dogOpen && (
            <div
              style={{
                position: 'absolute',
                left: compact ? 12 : 'auto',
                right: compact ? 12 : 14,
                bottom: 'calc(100% + 10px)',
                ...whisper,
                borderRadius: 16,
                padding: '10px 12px',
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: compact ? 'calc(100% - 24px)' : 360,
                animation: flow.reducedMotion ? 'none' : 'mock-rise 240ms cubic-bezier(0.25,0.8,0.35,1)',
              }}
            >
              {flow.dogs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    flow.setDog(d.id);
                    setDogOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: pastoral.cream,
                  }}
                >
                  <DogAvatar dog={d} size={44} active={d.id === flow.dog.id} ring={pastoral.cream} />
                  <span style={{ fontSize: 11, color: alpha(pastoral.cream, 86) }}>{d.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  const pct = flow.loading.pct;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* The target world's backdrop stays full-bleed; only a faint settle. */}
      <div style={{ position: 'absolute', inset: 0, transform: 'scale(1.04)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 22), pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(43,38,32,0) 40%, rgba(43,38,32,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Title stays put, so the load reads as the same screen settling. */}
      <div style={{ position: 'absolute', top: 22, left: 26 }}>
        <Title compact={false} />
      </div>

      {/* A calm bar pinned bottom-centre, no card. The scene carries it. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 0 34px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 'min(560px, 88%)', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--mock-display)',
              fontSize: 22,
              fontWeight: 500,
              color: pastoral.cream,
              textShadow: '0 1px 2px rgba(43,38,32,0.5), 0 3px 16px rgba(43,38,32,0.45)',
            }}
          >
            {flow.world.name}
          </div>
          <div style={{ fontSize: 13, color: alpha(pastoral.cream, 78), marginTop: 4, marginBottom: 18 }}>
            {flow.dog.name} · {flow.mode.name}
          </div>
          {/* A slim, scene-tinted bar (not the framed shell LoadingBar, which
              wants a plate). Keeps the chrome a whisper, on theme. */}
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: alpha(pastoral.cream, 22),
              border: `1px solid ${alpha(pastoral.cream, 16)}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: pastoral.cream,
                borderRadius: 999,
                transition: 'width 200ms cubic-bezier(0.25,0.8,0.35,1)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: alpha(pastoral.cream, 78) }}>
            <span>{flow.loading.label}</span>
            <span>{pct}%</span>
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

  // Ultra-minimal in-game: tiny corner counters only, no plates. Text shadow
  // does the legibility work so the scene stays unobstructed.
  const cornerText: CSSProperties = {
    color: pastoral.cream,
    textShadow: '0 1px 2px rgba(43,38,32,0.6), 0 2px 10px rgba(43,38,32,0.45)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--mock-display)',
    fontWeight: 600,
  };
  const ghostBtn: CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${alpha(pastoral.cream, 22)}`,
    background: alpha(pastoral.scrimWarm, 38),
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: pastoral.cream,
    cursor: 'pointer',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      {/* Faint top scrim only where the counters sit. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(43,38,32,0.28) 0%, rgba(43,38,32,0) 22%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top-left: tiny sheep counter. */}
      <div style={{ position: 'absolute', top: compact ? 12 : 18, left: compact ? 14 : 20, ...cornerText, fontSize: compact ? 17 : 19 }}>
        <Icon name="sheep" size={compact ? 16 : 18} color={pastoral.cream} />
        <span>{formatSheep(penned)}</span>
        <span style={{ fontWeight: 400, fontSize: compact ? 13 : 14, color: alpha(pastoral.cream, 80) }}>/ {formatSheep(total)}</span>
      </div>

      {/* Top-right: tiny timer + a ghost pause. */}
      <div style={{ position: 'absolute', top: compact ? 12 : 18, right: compact ? 14 : 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...cornerText, fontSize: compact ? 16 : 18 }}>
          <Icon name="timer" size={compact ? 14 : 16} color={pastoral.cream} />
          <span>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" aria-label="Pause and exit" style={ghostBtn}>
          <Icon name="pause" size={16} color={pastoral.cream} />
        </button>
      </div>

      {/* Bottom-left: tiny camera chip, text-only to stay a whisper. */}
      <div
        style={{
          position: 'absolute',
          bottom: compact ? 96 : 18,
          left: compact ? 14 : 20,
          ...cornerText,
          fontWeight: 500,
          fontSize: 12.5,
          fontFamily: 'var(--mock-text)',
        }}
      >
        <Icon name="compass" size={14} color={pastoral.cream} /> Follow
      </div>

      {/* Compact: a faint left joystick + a sprint button, the only on-screen
          input affordances. Still kept to a whisper of fill. */}
      {compact && (
        <>
          <div
            style={{
              position: 'absolute',
              bottom: 22,
              left: 18,
              width: 88,
              height: 88,
              borderRadius: '50%',
              border: `2px solid ${alpha(pastoral.cream, 50)}`,
              background: alpha(pastoral.scrimWarm, 30),
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 36,
                height: 36,
                marginLeft: -18,
                marginTop: -18,
                borderRadius: '50%',
                background: alpha(pastoral.cream, 64),
              }}
            />
          </div>
          <button
            title="Sprint"
            aria-label="Sprint"
            style={{
              position: 'absolute',
              bottom: 32,
              right: 22,
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: 'none',
              background: alpha(pastoral.accentMeadow, 82),
              color: pastoral.cream,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: `0 4px 14px ${alpha(pastoral.accentMeadow, 45)}`,
            }}
          >
            RUN
          </button>
        </>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'wide-open',
  name: 'Wide-Open',
  tagline: 'Full-bleed scene, a whisper of chrome.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
