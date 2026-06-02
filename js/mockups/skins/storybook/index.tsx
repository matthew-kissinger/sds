/**
 * Skin - Storybook. World-first, but the entrance is NOT the photo render: it is
 * a hand-painted CSS/SVG pastoral scene. A golden-hour sky, layered rolling-hill
 * silhouettes with parallax, a tiny dog-and-sheep on a ridge so it reads as this
 * game, and a faint drift of dusk motes. The armed world is named in a storybook
 * serif on a soft cream "page" card; switching worlds re-tints the illustrated
 * hills toward that world's mood. The Loading and InGame views may use the photo
 * WorldImage, framed in a warm storybook border. Warm and hand-illustrated, the
 * opposite of a photo UI.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/* The cream "page" card: a leaf from a picture book, soft border and a warm
 * paper grain via two stacked radial washes. */
const page: CSSProperties = {
  background: `radial-gradient(120% 90% at 50% 0%, ${alpha(pastoral.cream, 96)} 0%, ${alpha(pastoral.cream, 90)} 60%, ${alpha(pastoral.cream, 84)} 100%)`,
  border: `1.5px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 20,
  color: pastoral.ink,
  boxShadow: `0 14px 40px rgba(43,38,32,0.26), inset 0 1px 0 ${alpha(pastoral.cream, 80)}`,
};

/* A warm storybook frame for the photo views: a thick cream mat with a hairline
 * inner keyline, like a tipped-in plate. */
const plateFrame: CSSProperties = {
  border: `6px solid ${alpha(pastoral.cream, 92)}`,
  borderRadius: 18,
  boxShadow: `0 16px 44px rgba(43,38,32,0.34), inset 0 0 0 1px ${pastoral.glassWarmBorder}`,
};

const chipRound: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
  border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.cream, 70), color: pastoral.ink, cursor: 'pointer',
};

/**
 * The hand-painted scene behind the entrance. Pure CSS sky + SVG hill layers,
 * re-tinted toward the armed world via `accent`. Three parallax ridges in
 * meadow/hillShadow, a near foreground bank, and a small dog-and-sheep
 * silhouette on the second ridge so the illustration reads as THIS game.
 */
function PaintedScene({ accent, reducedMotion }: { accent: string; reducedMotion: boolean }) {
  const drift = (dur: number, delay = 0): CSSProperties =>
    reducedMotion ? {} : { animation: `mock-drift ${dur}s ease-in-out ${delay}s infinite` };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden="true">
      {/* Golden-hour sky wash: dawn -> gold -> dusk -> horizon, top to bottom. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${pastoral.pastureDawn} 0%, ${pastoral.pastureGold} 38%, ${pastoral.pastureDusk} 70%, ${pastoral.pastureHorizon} 100%)`,
        }}
      />
      {/* Low sun glow, tinted toward the world's accent so each biome feels distinct. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(60% 42% at 50% 70%, ${alpha(accent, 38)} 0%, ${alpha(accent, 14)} 40%, transparent 72%)`,
          mixBlendMode: 'soft-light',
        }}
      />
      {/* The sun disc, sitting just above the far ridge. */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '52%', width: 130, height: 130, marginLeft: -65,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(pastoral.cream, 95)} 0%, ${alpha(pastoral.cream, 55)} 45%, transparent 70%)`,
          ...drift(30, 0),
        }}
      />

      {/* Far ridge: palest, lowest contrast, slowest parallax. */}
      <svg viewBox="0 0 1200 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...drift(34, 0) }}>
        <path d="M0 360 C 200 320, 380 350, 560 332 C 760 312, 980 348, 1200 322 L1200 600 L0 600 Z" fill={pastoral.meadow} opacity={0.34} />
      </svg>
      {/* Mid ridge: the hero ridge, carries the dog + sheep. */}
      <svg viewBox="0 0 1200 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...drift(26, 0) }}>
        <path d="M0 430 C 240 388, 430 430, 620 408 C 840 382, 1010 428, 1200 404 L1200 600 L0 600 Z" fill={pastoral.meadow} opacity={0.62} />
        {/* accent-tinted rim light along the crest */}
        <path d="M0 430 C 240 388, 430 430, 620 408 C 840 382, 1010 428, 1200 404" fill="none" stroke={alpha(accent, 50)} strokeWidth={3} />
        {/* The dog-and-sheep vignette, riding the crest near 60% across. */}
        <DogAndSheep />
      </svg>
      {/* Near bank: darkest, in hill shadow, fastest parallax. */}
      <svg viewBox="0 0 1200 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...drift(20, 0) }}>
        <path d="M0 512 C 260 470, 520 520, 760 500 C 980 482, 1080 516, 1200 506 L1200 600 L0 600 Z" fill={pastoral.hillShadow} opacity={0.7} />
        {/* a couple of tufted grass marks on the near bank */}
        <g stroke={pastoral.hillShadow} strokeWidth={3} strokeLinecap="round" opacity={0.8}>
          <path d="M120 540 q -4 -16 0 -26 M128 540 q 2 -18 8 -24 M136 540 q 6 -14 14 -18" fill="none" />
          <path d="M1010 548 q -4 -16 0 -26 M1018 548 q 2 -18 8 -24 M1026 548 q 6 -14 14 -18" fill="none" />
        </g>
      </svg>

      {/* A soft top scrim so the title and corner nav stay legible against the sky. */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(pastoral.ink, 22)} 0%, transparent 24%)` }} />
    </div>
  );
}

/** The tiny shepherd vignette: one dog driving three sheep along the crest. */
function DogAndSheep() {
  return (
    <g transform="translate(690 392)">
      {/* three sheep ahead of the dog, walking left-to-right toward the pen */}
      <g fill={pastoral.cream} stroke={pastoral.hillShadow} strokeWidth={1.4}>
        <g transform="translate(0 0)">
          <ellipse cx="0" cy="0" rx="9" ry="6.5" />
          <circle cx="8" cy="-1" r="3.2" fill={pastoral.hillShadow} stroke="none" />
          <path d="M-5 6 v4 M3 6 v4" stroke={pastoral.hillShadow} strokeWidth={1.4} />
        </g>
        <g transform="translate(24 4)">
          <ellipse cx="0" cy="0" rx="8" ry="6" />
          <circle cx="7" cy="-1" r="3" fill={pastoral.hillShadow} stroke="none" />
          <path d="M-4 5.5 v3.5 M3 5.5 v3.5" stroke={pastoral.hillShadow} strokeWidth={1.4} />
        </g>
        <g transform="translate(46 -2)">
          <ellipse cx="0" cy="0" rx="8" ry="6" />
          <circle cx="7" cy="-1" r="3" fill={pastoral.hillShadow} stroke="none" />
          <path d="M-4 5.5 v3.5 M3 5.5 v3.5" stroke={pastoral.hillShadow} strokeWidth={1.4} />
        </g>
      </g>
      {/* the dog, behind and below, a crouched herding silhouette in hill shadow */}
      <g fill={pastoral.hillShadow} transform="translate(-34 8)">
        <ellipse cx="0" cy="0" rx="11" ry="5" />
        {/* head + perked ear, looking toward the flock */}
        <circle cx="11" cy="-3" r="3.6" />
        <path d="M12 -7 l3 -4 l1 5 z" />
        {/* tail, low and level */}
        <path d="M-10 -1 q -8 -1 -12 -5" stroke={pastoral.hillShadow} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        {/* legs */}
        <path d="M-6 4 v6 M-1 4 v6 M5 4 v6 M9 3 v6" stroke={pastoral.hillShadow} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  );
}

function CornerNav() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button style={chipRound} title="Leaderboard"><Icon name="trophy" size={18} /></button>
      <button style={chipRound} title="Settings"><Icon name="settings" size={18} /></button>
    </div>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [dogOpen, setDogOpen] = useState(false);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* The signature: a hand-painted scene, re-tinted to the armed world. */}
      <PaintedScene accent={flow.world.accent} reducedMotion={flow.reducedMotion} />
      <MoteField count={16} reducedMotion={flow.reducedMotion} color={alpha(pastoral.cream, 70)} />

      {/* Top: storybook title + corner nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: compact ? '16px 16px' : '22px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontStyle: 'italic', fontWeight: 600, fontSize: compact ? 22 : 30, color: pastoral.ink, textShadow: `0 1px 0 ${alpha(pastoral.cream, 70)}`, lineHeight: 1 }}>
            Sheepdog
          </div>
          <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 13 : 16, letterSpacing: '0.32em', textTransform: 'uppercase', color: pastoral.inkSoft, marginTop: 4 }}>
            Simulator
          </div>
        </div>
        <CornerNav />
      </div>

      {/* Bottom: the storybook page with the armed world */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', padding: compact ? 0 : '0 0 30px' }}>
        <div
          style={{
            ...page,
            width: compact ? '100%' : 'min(640px, 92%)',
            borderRadius: compact ? '20px 20px 0 0' : 20,
            padding: compact ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : '22px 24px',
            animation: flow.reducedMotion ? 'none' : 'mock-rise 380ms cubic-bezier(0.25,0.8,0.35,1)',
          }}
        >
          {/* World switcher, named in serif like a chapter heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={flow.prevWorld} title="Previous world" style={chipRound}><Icon name="prev" size={18} /></button>
            <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 23 : 28, fontWeight: 600, lineHeight: 1.1 }}>{flow.world.name}</div>
              <div style={{ fontFamily: 'var(--mock-display)', fontStyle: 'italic', fontSize: compact ? 13 : 14, color: pastoral.inkSoft, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.world.tagline}</div>
            </div>
            <button onClick={flow.nextWorld} title="Next world" style={chipRound}><Icon name="next" size={18} /></button>
          </div>
          {/* page-dot index */}
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
                <button
                  key={m.id}
                  onClick={() => flow.setMode(m.id)}
                  style={{
                    flexShrink: 0, padding: '8px 13px', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
                    background: active ? pastoral.accentMeadow : alpha(pastoral.ink, 5),
                    color: active ? pastoral.cream : pastoral.ink, textAlign: 'left', minWidth: 84,
                  }}
                >
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
            <button onClick={() => setDogOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 4, paddingRight: 12, borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.cream, 60), cursor: 'pointer', color: pastoral.ink }}>
              <DogAvatar dog={flow.dog} size={40} active />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.dog.name}</div>
                <div style={{ fontSize: 11, color: pastoral.inkSoft }}>{flow.dog.trait}</div>
              </div>
            </button>
            <button
              onClick={flow.commit}
              style={{
                flex: 1, height: 52, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: pastoral.accentMeadow, color: pastoral.cream, fontSize: 18, fontWeight: 700,
                fontFamily: 'var(--mock-display)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: `0 6px 18px ${alpha(pastoral.accentMeadow, 45)}`,
              }}
            >
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
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* A warm wash behind the framed plate, so the page reads as paper. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${pastoral.pastureGold} 0%, ${pastoral.pastureDusk} 60%, ${pastoral.pastureHorizon} 100%)`,
        }}
      />
      <MoteField count={12} reducedMotion={flow.reducedMotion} color={alpha(pastoral.cream, 55)} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: 'min(480px, 94%)' }}>
          {/* The target world as a tipped-in storybook plate. */}
          <div style={{ position: 'relative', aspectRatio: '16 / 10', ...plateFrame, overflow: 'hidden' }}>
            <WorldImage world={flow.world} overlay={`linear-gradient(180deg, transparent 40%, ${alpha(pastoral.ink, 30)} 100%)`} />
            <div style={{ position: 'absolute', left: 16, bottom: 14, right: 16 }}>
              <div style={{ fontFamily: 'var(--mock-display)', fontSize: 24, fontWeight: 600, color: pastoral.cream, textShadow: '0 2px 10px rgba(43,38,32,0.55)' }}>{flow.world.name}</div>
              <div style={{ fontSize: 13, color: alpha(pastoral.cream, 88), marginTop: 2 }}>{flow.dog.name} · {flow.mode.name}</div>
            </div>
          </div>
          {/* The calm bar sits on its own cream caption strip below the plate. */}
          <div style={{ ...page, marginTop: 14, padding: '16px 18px', display: 'flex', justifyContent: 'center' }}>
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
    boxShadow: '0 6px 20px rgba(43,38,32,0.18)',
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(pastoral.ink, 24)} 0%, transparent 30%)` }} />
      {/* A thin warm storybook keyline around the whole frame, tying it to the book. */}
      <div style={{ position: 'absolute', inset: compact ? 6 : 12, border: `2px solid ${alpha(pastoral.cream, 55)}`, borderRadius: 14, pointerEvents: 'none' }} />

      {/* Top-left: sheep penned / total */}
      <div style={{ position: 'absolute', top: compact ? 16 : 26, left: compact ? 16 : 26, ...hudGlass, padding: '10px 14px', minWidth: 172 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)} penned</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pennedPct}%`, height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause */}
      <div style={{ position: 'absolute', top: compact ? 16 : 26, right: compact ? 16 : 26, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.ink} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name="pause" size={18} color={pastoral.ink} />
        </button>
      </div>

      {/* Camera chip */}
      <div style={{ position: 'absolute', bottom: compact ? 132 : 28, left: compact ? 16 : 26, ...hudGlass, padding: '6px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="compass" size={14} color={pastoral.ink} /> Follow
      </div>

      {/* Mobile controls: joystick + sprint */}
      {compact && (
        <>
          <div style={{ position: 'absolute', bottom: 30, left: 22, width: 96, height: 96, borderRadius: '50%', border: `2px solid ${alpha(pastoral.cream, 65)}`, background: alpha(pastoral.ink, 16) }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: '50%', background: alpha(pastoral.cream, 78), border: `1px solid ${pastoral.glassWarmBorder}` }} />
          </div>
          <button style={{ position: 'absolute', bottom: 42, right: 24, width: 70, height: 70, borderRadius: '50%', border: 'none', background: alpha(pastoral.accentMeadow, 82), display: 'grid', placeItems: 'center', color: pastoral.cream, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mock-display)', cursor: 'pointer' }}>RUN</button>
        </>
      )}

      {/* Return-to-menu (desktop) */}
      {!compact && (
        <button onClick={flow.exit} style={{ position: 'absolute', bottom: 28, right: 26, ...hudGlass, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <Icon name="prev" size={16} color={pastoral.ink} /> Menu
        </button>
      )}
    </div>
  );
}

const skin: SkinModule = {
  id: 'storybook',
  name: 'Storybook',
  tagline: 'World-first on a hand-painted CSS/SVG pastoral scene.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
