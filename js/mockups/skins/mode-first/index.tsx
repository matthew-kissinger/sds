/**
 * Skin - Mode-First. The flow wildcard: the deliberate test of the OTHER
 * information architecture. Where the world-first skins open on a scene and let
 * difficulty ride a chip, this one surfaces HOW TO PLAY first. A local
 * 'mode' -> 'world' -> 'confirm' step machine inside the Entrance walks the
 * player through the choice in that order, then commits the same shared
 * { mode, world, dog } the other skins do. The thesis under test is sequence:
 * does picking the challenge first, then the place, then the dog, read as
 * clearer than a single world-first panel? Warm pastoral throughout, calm and
 * legible, three discrete steps so Matt can feel mode-first vs world-first.
 */
import { useState, type CSSProperties } from 'react';
import { pastoral, alpha } from '../../../components/ui/tokens';
import { WorldImage, DogAvatar, MoteField } from '../../shell/components';
import { Icon } from '../../shell/icons';
import { useViewport } from '../../shell/useViewport';
import { formatSheep } from '../../shell/data';
import type { SkinModule, SkinViewProps } from '../../shell/types';

type Step = 'mode' | 'world' | 'confirm';

/** Warm frosted panel the step content sits on. The calm constant. */
const glass: CSSProperties = {
  background: alpha(pastoral.cream, 84),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 12px 38px rgba(43,38,32,0.26)',
};

/** A soft warm-dusk gradient wash, the always-present backdrop under the panel. */
const PASTORAL_WASH =
  'linear-gradient(165deg, #f3ddb4 0%, #e9c79a 32%, #d7b79a 60%, #b9a9b2 100%)';

/** Per-step kicker copy: tells the player where they are in the sequence. */
const STEP_META: Record<Step, { n: number; kicker: string; title: string }> = {
  mode: { n: 1, kicker: 'Step 1 of 3', title: 'How do you want to play?' },
  world: { n: 2, kicker: 'Step 2 of 3', title: 'Where to?' },
  confirm: { n: 3, kicker: 'Step 3 of 3', title: 'Ready when you are.' },
};

/** Three-dot progress rail for the step machine. The current step reads long. */
function StepRail({ step }: { step: Step }) {
  const order: Step[] = ['mode', 'world', 'confirm'];
  const at = order.indexOf(step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {order.map((s, i) => {
        const active = i === at;
        const done = i < at;
        return (
          <span
            key={s}
            aria-hidden="true"
            style={{
              width: active ? 20 : 8,
              height: 8,
              borderRadius: 999,
              background: active
                ? pastoral.accentMeadow
                : done
                  ? pastoral.accentGold
                  : alpha(pastoral.ink, 20),
              transition: 'all 220ms cubic-bezier(0.25,0.8,0.35,1)',
            }}
          />
        );
      })}
    </div>
  );
}

/** Small back affordance shared by steps 2 and 3. */
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: pastoral.inkSoft,
        fontSize: 13,
        fontFamily: 'var(--mock-text)',
        padding: '4px 2px',
      }}
    >
      <Icon name="prev" size={15} color={pastoral.inkSoft} /> {label}
    </button>
  );
}

/* ------------------------------- Step 1: mode ------------------------------ */

function ModeStep({ flow, compact, onPick }: { flow: SkinViewProps['flow']; compact: boolean; onPick: () => void }) {
  const wayIcon = (id: string) => (id === 'online' ? 'users' : id === 'sandbox' ? 'sandbox' : 'local');
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        {flow.modes.map((m) => {
          const active = m.id === flow.mode.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                flow.setMode(m.id);
                onPick();
              }}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 16,
                padding: compact ? '12px 14px' : '14px 16px',
                border: `1px solid ${active ? 'transparent' : pastoral.glassWarmBorder}`,
                background: active ? pastoral.accentMeadow : alpha(pastoral.ink, 4),
                color: active ? pastoral.cream : pastoral.ink,
                boxShadow: active ? `0 6px 18px ${alpha(pastoral.accentMeadow, 42)}` : 'none',
                transition: 'background 160ms, box-shadow 160ms',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 18 : 19, fontWeight: 600, lineHeight: 1.05 }}>
                  {m.name}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: 0.9, flexShrink: 0 }}>
                  <Icon name="sheep" size={13} color={active ? pastoral.cream : pastoral.inkSoft} />
                  {formatSheep(m.sheep)}
                </span>
              </div>
              <span style={{ fontSize: 12.5, lineHeight: 1.35, color: active ? alpha(pastoral.cream, 88) : pastoral.inkSoft }}>
                {m.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary row: the ways to play. Distinct from the difficulty ladder. */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid ${alpha(pastoral.ink, 12)}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: pastoral.inkSoft, marginRight: 2 }}>Or:</span>
        {flow.ways.map((w) => (
          <button
            key={w.id}
            onClick={() => {
              flow.commit();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 13px',
              borderRadius: 999,
              border: `1px solid ${pastoral.glassWarmBorder}`,
              background: alpha(pastoral.ink, 4),
              color: pastoral.ink,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <Icon name={wayIcon(w.id)} size={15} color={pastoral.inkSoft} /> {w.name}
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ Step 2: world ------------------------------ */

function WorldStep({ flow, compact, onPick, onBack }: { flow: SkinViewProps['flow']; compact: boolean; onPick: () => void; onBack: () => void }) {
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {flow.worlds.map((w) => {
          const active = w.id === flow.world.id;
          return (
            <button
              key={w.id}
              onClick={() => {
                flow.armWorld(w.id);
                onPick();
              }}
              style={{
                position: 'relative',
                padding: 0,
                cursor: 'pointer',
                borderRadius: 16,
                overflow: 'hidden',
                border: `2px solid ${active ? pastoral.accentGold : 'transparent'}`,
                background: w.gradient,
                color: pastoral.cream,
                textAlign: 'left',
                boxShadow: active ? `0 8px 22px ${alpha(pastoral.ink, 30)}` : '0 4px 14px rgba(43,38,32,0.16)',
                aspectRatio: compact ? '16 / 7' : '4 / 5',
                display: 'block',
              }}
            >
              {/* Thumbnail render fills the tile; gradient is the decode fallback. */}
              <WorldImage world={w} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(43,38,32,0) 38%, rgba(43,38,32,0.66) 100%)',
                }}
              />
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: pastoral.accentGold,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 2px 8px rgba(43,38,32,0.4)',
                  }}
                >
                  <Icon name="check" size={15} color={pastoral.ink} strokeWidth={3} />
                </div>
              )}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: compact ? '10px 12px' : '12px 13px' }}>
                <div
                  style={{
                    fontFamily: 'var(--mock-display)',
                    fontSize: compact ? 18 : 17,
                    fontWeight: 600,
                    lineHeight: 1.05,
                    textShadow: '0 1px 6px rgba(43,38,32,0.6)',
                  }}
                >
                  {w.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    marginTop: 3,
                    color: alpha(pastoral.cream, 86),
                    lineHeight: 1.3,
                    textShadow: '0 1px 4px rgba(43,38,32,0.5)',
                  }}
                >
                  {w.tagline}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <BackButton label="Back to modes" onClick={onBack} />
      </div>
    </>
  );
}

/* ----------------------------- Step 3: confirm ----------------------------- */

function ConfirmStep({ flow, compact, onBack }: { flow: SkinViewProps['flow']; compact: boolean; onBack: () => void }) {
  const [dogOpen, setDogOpen] = useState(false);

  const summaryRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    background: alpha(pastoral.ink, 4),
    border: `1px solid ${alpha(pastoral.ink, 10)}`,
  };

  return (
    <>
      {/* The two chosen facts, mode then world, in the order they were picked. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={summaryRow}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              display: 'grid',
              placeItems: 'center',
              background: pastoral.accentMeadow,
              color: pastoral.cream,
              flexShrink: 0,
            }}
          >
            <Icon name="sheep" size={20} color={pastoral.cream} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: pastoral.inkSoft }}>Mode</div>
            <div style={{ fontFamily: 'var(--mock-display)', fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>
              {flow.mode.name}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: pastoral.inkSoft, flexShrink: 0 }}>
            <Icon name="sheep" size={14} color={pastoral.inkSoft} /> {formatSheep(flow.mode.sheep)}
          </div>
        </div>

        <div style={summaryRow}>
          <div style={{ width: 40, height: 40, borderRadius: 11, overflow: 'hidden', flexShrink: 0, position: 'relative', background: flow.world.gradient }}>
            <WorldImage world={flow.world} radius={11} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: pastoral.inkSoft }}>World</div>
            <div style={{ fontFamily: 'var(--mock-display)', fontSize: 18, fontWeight: 600, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {flow.world.name}
            </div>
          </div>
        </div>
      </div>

      {/* Dog: avatar + swap row. The third and last choice, optional. */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => setDogOpen((o) => !o)}
          aria-expanded={dogOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 8,
            paddingRight: 14,
            borderRadius: 14,
            border: `1px solid ${pastoral.glassWarmBorder}`,
            background: alpha(pastoral.ink, 4),
            cursor: 'pointer',
            color: pastoral.ink,
            textAlign: 'left',
          }}
        >
          <DogAvatar dog={flow.dog} size={44} active />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: pastoral.inkSoft }}>Your dog</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.15 }}>
              {flow.dog.name} <span style={{ fontWeight: 400, color: pastoral.inkSoft, fontSize: 13 }}>· {flow.dog.trait}</span>
            </div>
          </div>
          <span style={{ fontSize: 12.5, color: pastoral.accentMeadow, fontWeight: 600, flexShrink: 0 }}>
            {dogOpen ? 'Close' : 'Swap'}
          </span>
        </button>

        {dogOpen && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
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
                  color: pastoral.ink,
                }}
              >
                <DogAvatar dog={d} size={46} active={d.id === flow.dog.id} />
                <span style={{ fontSize: 11 }}>{d.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Play + back. The big commit lives only on the final step. */}
      <button
        onClick={flow.commit}
        style={{
          width: '100%',
          height: 54,
          marginTop: 16,
          borderRadius: 16,
          border: 'none',
          cursor: 'pointer',
          background: pastoral.accentMeadow,
          color: pastoral.cream,
          fontSize: 18,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: `0 6px 18px ${alpha(pastoral.accentMeadow, 45)}`,
        }}
      >
        <Icon name="play" size={20} /> Play
      </button>
      <div style={{ marginTop: 12, textAlign: compact ? 'center' : 'left' }}>
        <BackButton label="Back to worlds" onClick={onBack} />
      </div>
    </>
  );
}

/* ------------------------------- Entrance ---------------------------------- */

function EntranceView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const [step, setStep] = useState<Step>('mode');
  const meta = STEP_META[step];

  // The backdrop is a calm pastoral wash until a world is chosen; from step 2
  // onward the armed world render fades in behind it, softly blurred for calm.
  const showWorldBackdrop = step !== 'mode';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* Always-on warm wash. */}
      <div style={{ position: 'absolute', inset: 0, background: PASTORAL_WASH }} />
      {/* Armed world render, blurred, fades in once a world exists in the flow. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showWorldBackdrop ? 1 : 0,
          transition: 'opacity 600ms ease',
          filter: 'blur(8px) saturate(1.04)',
          transform: 'scale(1.08)',
        }}
      >
        <WorldImage world={flow.world} />
      </div>
      {/* Legibility veil over the backdrop so the cream panel reads on any scene. */}
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.scrimWarm, 30) }} />
      <MoteField count={12} reducedMotion={flow.reducedMotion} />

      {/* Title, top-left, persistent across steps. */}
      <div
        style={{
          position: 'absolute',
          top: compact ? 16 : 24,
          left: compact ? 18 : 30,
          right: compact ? 18 : 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mock-display)',
            fontWeight: 600,
            fontSize: compact ? 19 : 25,
            color: pastoral.ink,
            textShadow: '0 1px 10px rgba(247,240,228,0.5)',
          }}
        >
          Sheepdog Simulator
        </div>
        <StepRail step={step} />
      </div>

      {/* Centered step panel. One panel, three step bodies. */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: compact ? 14 : 24 }}>
        <div
          style={{
            ...glass,
            width: step === 'mode' ? 'min(680px, 96%)' : 'min(560px, 96%)',
            maxHeight: compact ? '82vh' : '86vh',
            overflowY: 'auto',
            padding: compact ? '18px 16px' : '24px 26px',
            animation: flow.reducedMotion ? 'none' : 'mock-rise 320ms cubic-bezier(0.25,0.8,0.35,1)',
          }}
          // Re-key per step so the rise animation replays on each advance.
          key={step}
        >
          {/* Kicker + step title. */}
          <div style={{ marginBottom: compact ? 14 : 18 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: pastoral.accentMeadow,
              }}
            >
              {meta.kicker}
            </div>
            <div style={{ fontFamily: 'var(--mock-display)', fontSize: compact ? 22 : 26, fontWeight: 600, marginTop: 4, lineHeight: 1.1 }}>
              {meta.title}
            </div>
          </div>

          {step === 'mode' && <ModeStep flow={flow} compact={compact} onPick={() => setStep('world')} />}
          {step === 'world' && (
            <WorldStep flow={flow} compact={compact} onPick={() => setStep('confirm')} onBack={() => setStep('mode')} />
          )}
          {step === 'confirm' && <ConfirmStep flow={flow} compact={compact} onBack={() => setStep('world')} />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Loading ---------------------------------- */

function LoadingView({ flow }: SkinViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      {/* Target world's backdrop, gently settling, behind a calm bar. */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', transform: 'scale(1.05)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 36) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...glass, padding: '30px 28px', width: 'min(440px, 92%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mock-display)', fontSize: 24, fontWeight: 600 }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, marginBottom: 22 }}>
            {flow.mode.name} · {flow.dog.name}
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: pastoral.glassWarm,
              border: `1px solid ${pastoral.glassWarmBorder}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${flow.loading.pct}%`,
                background: pastoral.accentMeadow,
                borderRadius: 999,
                transition: 'width 200ms cubic-bezier(0.25,0.8,0.35,1)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: pastoral.inkSoft }}>
            <span>{flow.loading.label}</span>
            <span>{flow.loading.pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- InGame ---------------------------------- */

function InGameView({ flow }: SkinViewProps) {
  const { compact } = useViewport();
  const total = flow.mode.sheep;
  const penned = Math.round(total * 0.42);
  const pennedPct = total > 0 ? Math.round((penned / total) * 100) : 0;

  const hudGlass: CSSProperties = {
    background: alpha(pastoral.cream, 80),
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${pastoral.glassWarmBorder}`,
    borderRadius: 14,
    color: pastoral.ink,
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'var(--mock-text)' }}>
      <WorldImage world={flow.world} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(43,38,32,0.25) 0%, rgba(43,38,32,0) 30%)' }} />

      {/* Top-left: sheep penned / total + a progress bar. */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, left: compact ? 10 : 18, ...hudGlass, padding: '10px 14px', minWidth: 172 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sheep" size={18} color={pastoral.ink} />
          <span style={{ fontFamily: 'var(--mock-display)', fontSize: 20, fontWeight: 600 }}>{formatSheep(penned)}</span>
          <span style={{ color: pastoral.inkSoft, fontSize: 13 }}>/ {formatSheep(total)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: alpha(pastoral.ink, 12), marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pennedPct}%`, height: '100%', background: pastoral.accentMeadow, borderRadius: 999 }} />
        </div>
      </div>

      {/* Top-right: timer + pause (exits). */}
      <div style={{ position: 'absolute', top: compact ? 10 : 18, right: compact ? 10 : 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ ...hudGlass, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="timer" size={16} color={pastoral.ink} /> <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600 }}>02:14</span>
        </div>
        <button onClick={flow.exit} title="Pause" aria-label="Pause and exit" style={{ ...hudGlass, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
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
          <button
            title="Sprint"
            aria-label="Sprint"
            style={{
              position: 'absolute',
              bottom: 36,
              right: 22,
              width: 68,
              height: 68,
              borderRadius: '50%',
              border: 'none',
              background: alpha(pastoral.accentMeadow, 82),
              color: pastoral.cream,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: `0 4px 14px ${alpha(pastoral.accentMeadow, 45)}`,
            }}
          >
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
  id: 'mode-first',
  name: 'Mode-First',
  tagline: 'Pick how to play first, then where, then your dog.',
  flowKind: 'mode-first',
  Entrance: EntranceView,
  Loading: LoadingView,
  InGame: InGameView,
};
export default skin;
