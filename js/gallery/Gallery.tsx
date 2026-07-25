// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 49 standalone UI gallery (P3 scaffold). P4 adds the pastoral primitive
 * preview; P5 adds the entrance/loading mockups.
 *
 * A pure React + CSS surface that renders the pastoral palette and the six
 * owned primitives WITHOUT booting the WebGPU game. It is the program's
 * headless review surface: jsdom specs mount it without publishing a production
 * route. It imports no game-runtime module (no renderer, scene builder, or
 * attract field).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { pastoral } from '../components/ui/tokens';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';
import { Panel, PanelTitle } from '../components/ui/Panel';
import { Surface } from '../components/ui/Surface';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';

const page: CSSProperties = {
  minHeight: '100vh',
  background: '#1b1f24',
  color: '#e8e6e1',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: '2.5rem 1.5rem 6rem',
};

const wrap: CSSProperties = { maxWidth: 1040, margin: '0 auto' };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={id} style={{ marginTop: '3rem' }}>
      <h2 style={{ fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.65, marginBottom: '1.1rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div data-testid="gallery-swatch" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 56, borderRadius: 10, background: value, border: '1px solid rgba(255,255,255,0.12)' }} />
      <div style={{ fontSize: 12, opacity: 0.85 }}>{name}</div>
      <div style={{ fontSize: 11, opacity: 0.5, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' };

function PrimitivesDemo() {
  return (
    <>
      <div style={row}>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <IconButton aria-label="next"><Icon name="next" size={18} /></IconButton>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="neutral">Neutral</Badge>
      </div>
      <div style={{ ...row, marginTop: '1.25rem' }}>
        <Surface style={{ padding: '1rem', maxWidth: 240 }}>Surface glass</Surface>
        <Card style={{ padding: '1rem', maxWidth: 240 }}>Card (inactive)</Card>
        <Card active style={{ padding: '1rem', maxWidth: 240 }}>Card (active)</Card>
        <Panel size="sm"><PanelTitle>Panel</PanelTitle><div>Panel body</div></Panel>
      </div>
    </>
  );
}

// Cycle 49 P4: remap the tokens the primitives consume to pastoral values on a
// wrapper only, so the six primitives render warm with zero change to their
// source. This is the gallery-only theming wrapper the plan calls for; the live
// primitive APIs are untouched.
const pastoralVars: Record<string, string> = {
  '--color-accent': 'var(--color-accent-meadow)',
  '--color-accent-strong': 'var(--color-accent-gold)',
  '--color-accent-soft': 'var(--color-meadow)',
  '--color-text': 'var(--color-ink)',
  '--color-on-accent': 'var(--color-cream)',
  '--color-surface-glass': 'var(--color-glass-warm)',
  '--color-surface-glass-border': 'var(--color-glass-warm-border)',
};
const pastoralTheme: CSSProperties = {
  ...(pastoralVars as CSSProperties),
  background: 'linear-gradient(160deg, var(--color-pasture-dawn) 0%, var(--color-pasture-gold) 45%, var(--color-pasture-dusk) 82%, var(--color-pasture-horizon) 100%)',
  padding: '2rem',
  borderRadius: 16,
};

// Cycle 49 P5: static mockups of the instant entrance and the pastoral loading
// experience specified in docs/entrance-loading-spec.md. Pure React + CSS + SVG,
// no WebGPU. The title uses a serif fallback (the Fraunces display face loads in
// Cycle 50). EntranceMock shows the painterly backdrop + scene picker; LoadingMock
// shows the eased real-stage progress that replaces the shimmer-skeleton cover.
function EntranceMock() {
  return (
    <div
      data-testid="gallery-entrance-mock"
      style={{
        ...(pastoralVars as CSSProperties),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        minHeight: 320,
        background: 'linear-gradient(180deg, var(--color-pasture-dawn) 0%, var(--color-pasture-gold) 52%, var(--color-pasture-dusk) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'var(--color-ink)',
      }}
    >
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '55%' }}>
        <path d="M0,120 C150,70 300,150 450,90 C520,60 580,100 600,90 L600,200 L0,200 Z" fill="var(--color-hill-shadow)" opacity="0.55" />
        <path d="M0,150 C120,110 280,170 430,130 C520,108 580,140 600,135 L600,200 L0,200 Z" fill="var(--color-meadow)" opacity="0.85" />
        <circle cx="300" cy="120" r="5" fill="var(--color-ink)" opacity="0.7" />
        <circle cx="330" cy="125" r="6" fill="var(--color-cream)" opacity="0.9" />
        <circle cx="348" cy="125" r="6" fill="var(--color-cream)" opacity="0.9" />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '2rem', fontWeight: 600 }}>Sheep Dog Sim</div>
        <div style={{ opacity: 0.7, marginTop: 4, fontSize: '0.9rem' }}>Pick a pasture</div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Card style={{ padding: '0.7rem 1rem', minWidth: 108 }}>Home Field</Card>
          <Card active style={{ padding: '0.7rem 1rem', minWidth: 108 }}>Rolling Hills</Card>
          <Card style={{ padding: '0.7rem 1rem', minWidth: 108 }}>Open Country</Card>
        </div>
      </div>
    </div>
  );
}

const LOAD_STAGES = ['Heightfield', 'Terrain', 'Grass', 'Trees', 'Flock'];
function LoadingMock() {
  const [p, setP] = useState(0.12);
  useEffect(() => {
    const id = setInterval(() => setP((x) => (x >= 1 ? 0.12 : Math.min(1, x + 0.07))), 320);
    return () => clearInterval(id);
  }, []);
  const stage = LOAD_STAGES[Math.min(LOAD_STAGES.length - 1, Math.floor(p * LOAD_STAGES.length))];
  const pct = Math.round(p * 100);
  return (
    <div
      data-testid="gallery-loading-mock"
      style={{
        ...(pastoralVars as CSSProperties),
        background: 'linear-gradient(180deg, var(--color-pasture-gold) 0%, var(--color-pasture-dusk) 100%)',
        borderRadius: 16,
        padding: '2.5rem 2rem',
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.1rem',
        color: 'var(--color-ink)',
      }}
    >
      <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.3rem' }}>Settling the flock</div>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--color-glass-warm)', border: '1px solid var(--color-glass-warm-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent-meadow)', borderRadius: 999, transition: 'width 320ms cubic-bezier(0.25, 0.8, 0.35, 1)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.8rem', opacity: 0.85 }}>
          <span>{stage}</span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

export function Gallery() {
  return (
    <div style={page}>
      <div style={wrap}>
        <header>
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>SDS UI Gallery</h1>
          <p style={{ opacity: 0.7, marginTop: 8, maxWidth: 640 }}>
            Cycle 49 pastoral-vision. The headless review surface for the calm-pastoral palette,
            the owned primitives, and the entrance/loading mockups. No WebGPU game runs here.
          </p>
        </header>

        <Section id="gallery-palette" title="Pastoral palette v2">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
            {Object.entries(pastoral).map(([name, value]) => (
              <Swatch key={name} name={name} value={value as string} />
            ))}
          </div>
        </Section>

        <Section id="gallery-primitives" title="Primitives (current theme)">
          <PrimitivesDemo />
        </Section>

        <Section id="gallery-pastoral-primitives" title="Primitives (pastoral palette)">
          <div style={pastoralTheme}>
            <PrimitivesDemo />
          </div>
        </Section>

        <Section id="gallery-entrance" title="Entrance mockup (instant lightweight menu)">
          <EntranceMock />
        </Section>

        <Section id="gallery-loading" title="Loading mockup (eased stage progress)">
          <LoadingMock />
        </Section>
      </div>
    </div>
  );
}
