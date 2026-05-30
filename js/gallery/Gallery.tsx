/**
 * Cycle 49 standalone UI gallery (P3 scaffold). P4 adds the pastoral primitive
 * preview; P5 adds the entrance/loading mockups.
 *
 * A pure React + CSS surface that renders the pastoral palette and the six
 * owned primitives WITHOUT booting the WebGPU game. It is the program's
 * headless review surface: `npm run build` emits dist/gallery.html, jsdom specs
 * mount it, and the look is signed off on the deployed /gallery. It imports no
 * game-runtime module (no renderer, scene builder, or attract field).
 */
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { pastoral } from '../components/ui/tokens';
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
          <div style={row}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <IconButton aria-label="next"><ChevronRight size={18} /></IconButton>
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
        </Section>
      </div>
    </div>
  );
}
