/**
 * Skin - Biome Cards. World-first, selection-first: the three worlds are three
 * large cards laid side by side across the page, not a carousel. Choosing your
 * world is the primary act. Click a card to arm it; the armed card grows and
 * brightens and reveals its play controls (mode chips, dog, Play) while the
 * other two dim. On phone the cards stack vertically and the armed one expands.
 * Distinctive trait vs Golden Pasture: cards-not-carousel, all three worlds
 * visible at once, selection forward.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, LoadingBar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

/** Warm frosted panel, used for the play controls and the HUD readouts. */
const glass: CSSProperties = {
  background: alpha(pastoral.cream, 86),
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  color: pastoral.ink,
};

const chipRound: CSSProperties = {
  width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
  background: alpha(pastoral.cream, 72), border: `1px solid ${pastoral.glassWarmBorder}`,
  color: pastoral.ink, cursor: 'pointer', backdropFilter: 'blur(8px)',
};

function CornerNav() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button style={chipRound} title="Leaderboard"><Icon name="trophy" size={18} /></button>
      <button style={chipRound} title="Settings"><Icon name="settings" size={18} /></button>
    </div>
  );
}

/**
 * The five-mode difficulty row, the dog pill (with a swap-out row), and Play.
 * Lives on the armed card's body (desktop) or below the expanded card (phone).
 * Shared so both layouts render identical controls.
 */
function PlayControls({ flow, accent }: SkinViewProps & { accent: string }) {
  const [dogOpen, setDogOpen] = useState(false);
  return (
    <div>
      {/* Difficulty chips for the five solo modes */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
        {flow.modes.map((m) => {
          const active = m.id === flow.mode.id;
          return (
            <button key={m.id} onClick={() => flow.setMode(m.id)} style={{
              flexShrink: 0, padding: '7px 11px', borderRadius: 11, cursor: 'pointer',
              border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
              background: active ? accent : alpha(pastoral.ink, 5),
              color: active ? pastoral.cream : pastoral.ink, textAlign: 'left', minWidth: 78,
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 10.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Icon name="sheep" size={11} color={active ? pastoral.cream : pastoral.inkSoft} /> {formatSheep(m.sheep)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dog pill + Play. DogAvatar is a div, so nesting it in the pill button is valid. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button
          onClick={() => setDogOpen((o) => !o)}
          title="Swap dog"
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 4, paddingRight: 12, borderRadius: 999, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 4), cursor: 'pointer', color: pastoral.ink }}
        >
          <DogAvatar dog={flow.dog} size={38} active ring={accent} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{flow.dog.name}</div>
            <div style={{ fontSize: 10.5, color: pastoral.inkSoft }}>{flow.dog.trait}</div>
          </div>
        </button>
        <button onClick={flow.commit} style={{
          flex: 1, height: 50, borderRadius: 15, border: 'none', cursor: 'pointer',
          background: accent, color: pastoral.cream, fontSize: 17, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 6px 18px ${alpha(accent, 45)}`,
        }}>
          <Icon name="play" size={19} /> Play
        </button>
      </div>

      {/* Dog swap row */}
      {dogOpen && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {flow.dogs.map((d) => (
            <button key={d.id} onClick={() => { flow.setDog(d.id); setDogOpen(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: pastoral.ink }}>
              <DogAvatar dog={d} size={42} active={d.id === flow.dog.id} ring={accent} />
              <span style={{ fontSize: 11 }}>{d.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Secondary ways to play */}
      <div style={{ display: 'flex', gap: 14, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        {flow.ways.map((w) => (
          <button key={w.id} onClick={flow.commit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pastoral.inkSoft, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={w.id === 'online' ? 'users' : w.id === 'sandbox' ? 'sandbox' : 'local'} size={14} /> {w.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One biome card. Its face is the world render; an accent border in the world's
 * own accent. Armed -> brightened, promoted, controls revealed. Not armed ->
 * dimmed and recessed. Clicking the face arms the world (flow.armWorld).
 */
function BiomeCard({
  flow, worldId, armed, anyArmed, compact,
}: SkinViewProps & { worldId: string; armed: boolean; anyArmed: boolean; compact: boolean }) {
  const world = flow.worlds.find((w) => w.id === worldId)!;
  const accent = world.accent;
  // Dim the unselected cards once a world is armed; full strength before arming.
  const dim = anyArmed && !armed;

  // The clickable face: render + name + tagline + the accent frame.
  const face = (
    <button
      onClick={() => flow.armWorld(world.id)}
      title={`Choose ${world.name}`}
      style={{
        position: 'relative', display: 'block', width: '100%', flex: compact ? 'none' : 1,
        minHeight: compact ? (armed ? 200 : 96) : 0,
        padding: 0, cursor: 'pointer', overflow: 'hidden',
        borderRadius: 20,
        border: `2.5px solid ${armed ? accent : alpha(pastoral.cream, 55)}`,
        boxShadow: armed ? `0 16px 40px rgba(43,38,32,0.34), 0 0 0 4px ${alpha(accent, 30)}` : '0 8px 22px rgba(43,38,32,0.22)',
        transition: flow.reducedMotion ? 'none' : 'min-height 320ms cubic-bezier(0.25,0.8,0.35,1), box-shadow 320ms ease, border-color 220ms ease',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, animation: armed && !flow.reducedMotion ? 'mock-kenburns 26s ease-in-out infinite alternate' : 'none' }}>
        <WorldImage world={world} />
      </div>
      {/* Legibility gradient + a dimming veil for unselected cards. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.12) 0%, rgba(43,38,32,0) 38%, rgba(43,38,32,0.66) 100%)' }} />
      {dim && <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 38), transition: 'opacity 220ms ease' }} />}

      {/* Title block on the card face */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: compact ? '14px 16px' : '18px 18px', textAlign: 'left' }}>
        <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 21 : 24, lineHeight: 1.08, color: pastoral.cream, textShadow: '0 2px 12px rgba(43,38,32,0.6)' }}>
          {world.name}
        </div>
        <div style={{ fontSize: compact ? 12.5 : 13, color: alpha(pastoral.cream, 88), marginTop: 4, textShadow: '0 1px 8px rgba(43,38,32,0.55)' }}>
          {world.tagline}
        </div>
      </div>

      {/* "Choose" affordance pinned top-right on the unselected cards */}
      {!armed && (
        <div style={{ position: 'absolute', top: 12, right: 12, ...glass, borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: accent }} /> Choose
        </div>
      )}
      {/* "Chosen" badge top-right on the armed card */}
      {armed && (
        <div style={{ position: 'absolute', top: 12, right: 12, background: accent, color: pastoral.cream, borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, boxShadow: `0 4px 12px ${alpha(accent, 50)}` }}>
          <Icon name="check" size={13} color={pastoral.cream} /> Chosen
        </div>
      )}
    </button>
  );

  // The armed card reveals its play controls directly under the face, inside the
  // same column, so the card "grows" into a full play surface.
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        flex: compact ? 'none' : (armed ? 1.35 : 1),
        minWidth: 0,
        transition: flow.reducedMotion ? 'none' : 'flex 320ms cubic-bezier(0.25,0.8,0.35,1)',
      }}
    >
      {face}
      {armed && (
        <div style={{
          ...glass, borderRadius: 18, padding: compact ? '14px 14px calc(14px + env(safe-area-inset-bottom))' : '15px 16px',
          boxShadow: '0 10px 30px rgba(43,38,32,0.2)',
          animation: flow.reducedMotion ? 'none' : 'mock-rise 340ms cubic-bezier(0.25,0.8,0.35,1)',
        }}>
          <PlayControls flow={flow} accent={accent} />
        </div>
      )}
    </div>
  );
}

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  // A world is "armed" for this skin once it is both the selected world AND the
  // user has committed to selecting (we treat the current flow.world as armed so
  // the surface always has one promoted card; arming swaps which one).
  const armedId = flow.world.id;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)', background: `linear-gradient(180deg, ${pastoral.pastureDawn} 0%, ${pastoral.pastureGold} 100%)` }}>
      {/* A soft drift of motes over the warm page */}
      <MoteField count={12} reducedMotion={flow.reducedMotion} color={alpha(pastoral.ink, 14)} />

      {/* Top: small title + corner nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: compact ? '14px 16px' : '18px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
        <div>
          <div style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: compact ? 18 : 22, color: pastoral.ink }}>
            Sheepdog Simulator
          </div>
          <div style={{ fontSize: compact ? 11.5 : 12.5, color: pastoral.inkSoft, marginTop: 1 }}>Choose your world</div>
        </div>
        <CornerNav />
      </div>

      {/* The three cards. Side by side on desktop, stacked on phone. */}
      <div style={{
        position: 'absolute', inset: 0,
        paddingTop: compact ? 66 : 80,
        paddingBottom: compact ? 16 : 22,
        paddingLeft: compact ? 14 : 26,
        paddingRight: compact ? 14 : 26,
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        gap: compact ? 12 : 18,
        alignItems: 'stretch',
        overflowY: compact ? 'auto' : 'hidden',
      }}>
        {flow.worlds.map((w) => (
          <BiomeCard
            key={w.id}
            flow={flow}
            worldId={w.id}
            armed={w.id === armedId}
            anyArmed={true}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingView({ flow }: SkinViewProps) {
  // The target world's backdrop sits behind a calm bar.
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', transform: 'scale(1.05)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 40) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{
          ...glass, borderRadius: 22, padding: '30px 28px', width: 'min(440px, 92%)', textAlign: 'center',
          boxShadow: '0 12px 36px rgba(43,38,32,0.3)',
          borderTop: `3px solid ${flow.world.accent}`,
        }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontSize: 24, fontWeight: 600 }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, marginBottom: 22 }}>{flow.dog.name} · {flow.mode.name}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={flow.world.accent} />
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
  const accent = flow.world.accent;
  const hudGlass: CSSProperties = {
    ...glass, borderRadius: 14,
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.24) 0%, rgba(43,38,32,0) 30%)' }} />

      {/* Top-left: sheep penned / total + progress */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 168 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: '42%', height: '100%', background: accent, borderRadius: 999 }} />
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
          <div style={{ position: 'absolute', bottom: 36, right: 22, width: 68, height: 68, borderRadius: '50%', background: alpha(accent, 85), display: 'grid', placeItems: 'center', color: pastoral.cream, fontWeight: 700, fontSize: 13 }}>RUN</div>
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
  id: 'biome-cards',
  name: 'Biome Cards',
  tagline: 'Three worlds as side-by-side cards, selection-first.',
  flowKind: 'world-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
