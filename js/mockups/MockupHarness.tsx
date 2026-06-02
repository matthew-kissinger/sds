/**
 * Cycle 51 P1: the bake-off harness. An index of the ten prototypes with
 * deep-links (#/<slug>), and a per-skin stage that drives the shared flow
 * (entrance -> loading -> in-game) and lets you flip between prototypes. No
 * game-runtime import; the whole route composites headlessly.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { pastoral } from '../components/ui/tokens';
import { MockupStyles } from './shell/MockupStyles';
import { useMockFlow } from './shell/useMockFlow';
import { useViewport } from './shell/useViewport';
import { Icon } from './shell/icons';
import { SKINS } from './skins';
import type { SkinModule } from './shell/types';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function slugFromHash(hash: string): string | null {
  const m = hash.match(/#\/?([\w-]+)/);
  return m ? m[1] : null;
}

function go(slug: string | null) {
  window.location.hash = slug ? `#/${slug}` : '';
}

/** One skin running its full flow; remounts (fresh flow) when the skin changes. */
function SkinStage({ skin }: { skin: SkinModule }) {
  const flow = useMockFlow();
  const View = flow.step === 'entrance' ? skin.Entrance : flow.step === 'loading' ? skin.Loading : skin.InGame;
  // Test affordance for the headless capture script: a step marker to wait on,
  // and a window handle so the script can drive commit()/exit() uniformly across
  // skins (including the multi-step mode-first flow). Review-route only.
  useEffect(() => {
    (window as unknown as { __mockFlow?: typeof flow }).__mockFlow = flow;
  }, [flow]);
  return (
    <div data-step={flow.step} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <View flow={flow} />
    </div>
  );
}

const bar: CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, height: 46, zIndex: 9999,
  display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
  background: 'rgba(20,17,13,0.82)', backdropFilter: 'blur(10px)',
  borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f2ece1', fontSize: 13,
};

const barBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
  borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)',
  color: '#f2ece1', cursor: 'pointer', fontSize: 13,
};

function SkinView({ slug }: { slug: string }) {
  const { compact } = useViewport();
  const idx = SKINS.findIndex((s) => s.id === slug);
  const skin = idx >= 0 ? SKINS[idx] : null;
  if (!skin) {
    return (
      <div style={{ padding: 80, textAlign: 'center', color: '#f2ece1' }}>
        <p>No prototype named "{slug}".</p>
        <button style={barBtn} onClick={() => go(null)}>Back to all</button>
      </div>
    );
  }
  const prev = SKINS[(idx - 1 + SKINS.length) % SKINS.length];
  const next = SKINS[(idx + 1) % SKINS.length];
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div style={bar}>
        <button style={barBtn} onClick={() => go(null)}><Icon name="prev" size={16} /> All</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {idx + 1}. {skin.name}
          </span>
          {!compact && (
            <>
              <span style={{ opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {skin.tagline}
              </span>
              <span style={{ opacity: 0.5, fontSize: 11, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                {skin.flowKind}
              </span>
            </>
          )}
        </div>
        <button style={barBtn} onClick={() => go(prev.id)} title={prev.name}><Icon name="prev" size={16} /></button>
        <button style={barBtn} onClick={() => go(next.id)} title={next.name}><Icon name="next" size={16} /></button>
      </div>
      <div style={{ position: 'absolute', top: 46, left: 0, right: 0, bottom: 0 }}>
        <SkinStage key={skin.id} skin={skin} />
      </div>
    </div>
  );
}

function IndexCard({ skin, n }: { skin: SkinModule; n: number }) {
  return (
    <button
      onClick={() => go(skin.id)}
      style={{
        textAlign: 'left', padding: 0, cursor: 'pointer', borderRadius: 14, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#f2ece1',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'linear-gradient(180deg,#f0b878,#d99a8f)' }}>
        <img src="/assets/marketing/og/og-rh-sunset.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,17,13,0) 40%, rgba(20,17,13,0.72) 100%)' }} />
        <span style={{
          position: 'absolute', top: 10, left: 10, width: 26, height: 26, borderRadius: '50%',
          background: pastoral.accentGold, color: '#2b2620', fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{n}</span>
        <span style={{ position: 'absolute', left: 12, bottom: 10, fontFamily: 'var(--mock-display)', fontWeight: 600, fontSize: 18 }}>
          {skin.name}
        </span>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>{skin.tagline}</div>
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.5 }}>{skin.flowKind}</div>
      </div>
    </button>
  );
}

function IndexView() {
  return (
    <div style={{ minHeight: '100vh', background: '#14110d', color: '#f2ece1', padding: '2.5rem 1.5rem 5rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--mock-display)', fontSize: '2rem', fontWeight: 600, margin: 0 }}>
            Sheepdog Simulator
          </h1>
          <p style={{ opacity: 0.7, marginTop: 8, maxWidth: 640, lineHeight: 1.55 }}>
            Frontend bake-off. Ten entrance-and-flow prototypes over one shared flow. Try each one (arm a world,
            set the difficulty, swap the dog, press Play, watch it load, land in the HUD), then keep one. No
            WebGPU game runs here; backdrops are the in-repo scene renders.
          </p>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.1rem' }}>
          {SKINS.map((s, i) => <IndexCard key={s.id} skin={s} n={i + 1} />)}
        </div>
        {SKINS.length === 0 && <p style={{ opacity: 0.6 }}>No prototypes registered yet.</p>}
      </div>
    </div>
  );
}

export function MockupHarness() {
  const hash = useHashRoute();
  const slug = slugFromHash(hash);
  return (
    <>
      <MockupStyles />
      {slug ? <SkinView slug={slug} /> : <IndexView />}
    </>
  );
}
