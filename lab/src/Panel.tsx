// SPDX-License-Identifier: AGPL-3.0-or-later
/** The lab's controls. Plain DOM: none of this is player-facing interface. */

import type { ChangeEvent } from 'react';
import type { FlockSize } from '@app/state/store';
import { useLabStore, type LabViewMode } from './labStore';
import { LAB_SUBJECTS, labSubject, type LabSubjectId } from './subjects';
import { GRADINGS, grading } from './grassGradings';

const VIEWS: readonly { readonly id: LabViewMode; readonly label: string }[] = [
  { id: 'lit', label: 'Lit' },
  { id: 'silhouette', label: 'Silhouette' },
  { id: 'wireframe', label: 'Wireframe' },
];

const QUALITIES = ['high', 'medium', 'low'] as const;
const FLOCK_SIZES: readonly FlockSize[] = [25, 75, 200];

const row = { display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '10px' };
const label = { display: 'block', opacity: 0.6, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '4px' };

function Button(props: { readonly on: boolean; readonly onClick: () => void; readonly children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        background: props.on ? '#5d7f74' : '#20262a',
        color: props.on ? '#f2ece0' : '#b9b2a6',
        border: '1px solid #2e363b',
        borderRadius: '4px',
        padding: '4px 9px',
        font: 'inherit',
        cursor: 'pointer',
      }}
    >
      {props.children}
    </button>
  );
}

function Slider(props: {
  readonly name: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'block', marginBottom: '10px' }}>
      <span style={label}>{props.name} — {props.value.toFixed(props.step < 1 ? 2 : 0)}{props.suffix}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

export function Panel() {
  const lab = useLabStore();
  const subject = labSubject(lab.subject);

  // Flipping between two subjects that authored the SAME frame holds the camera
  // exactly, which is what makes the shipped/library grass pair an A/B rather
  // than two unrelated views. A subject with a frame of its own adopts it.
  const pickSubject = (id: LabSubjectId) => {
    const from = labSubject(lab.subject);
    const next = labSubject(id);
    const sameFrame = next.distance === from.distance && next.height === from.height;
    useLabStore.setState(sameFrame
      ? { subject: id }
      : { subject: id, distance: next.distance, height: next.height, orbit: 0 });
  };

  return (
    <aside style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '300px',
      padding: '14px', overflowY: 'auto',
      background: 'rgba(16,20,23,0.92)', borderLeft: '1px solid #2e363b',
    }}>
      <h1 style={{ font: '600 14px/1.3 inherit', margin: '0 0 2px' }}>Asset lab</h1>
      <p style={{ margin: '0 0 14px', fontSize: '11px', opacity: 0.55 }}>
        Iteration only. Acceptance comes from the production build, and timings
        come from the hub.
      </p>

      <span style={label}>Subject</span>
      <div style={row}>
        {LAB_SUBJECTS.map((entry) => (
          <Button key={entry.id} on={entry.id === lab.subject} onClick={() => pickSubject(entry.id)}>
            {entry.label}
          </Button>
        ))}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '11px', opacity: 0.7 }}>{subject.note}</p>

      <span style={label}>View</span>
      <div style={row}>
        {VIEWS.map((entry) => (
          <Button key={entry.id} on={entry.id === lab.view} onClick={() => lab.setView(entry.id)}>
            {entry.label}
          </Button>
        ))}
      </div>

      <span style={label}>Ground</span>
      <div style={row}>
        <Button on={lab.ground} onClick={() => lab.setGround(!lab.ground)}>
          {lab.ground ? 'Terrain and grass' : 'Subject alone'}
        </Button>
      </div>

      <span style={label}>Grading</span>
      <div style={row}>
        {GRADINGS.map((entry) => (
          <Button key={entry.id} on={entry.id === lab.grading} onClick={() => lab.setGrading(entry.id)}>
            {entry.label}
          </Button>
        ))}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '11px', opacity: 0.7 }}>{grading(lab.grading).note}</p>

      <span style={label}>Tier</span>
      <div style={row}>
        {QUALITIES.map((quality) => (
          <Button key={quality} on={quality === lab.quality} onClick={() => lab.setQuality(quality)}>
            {quality}
          </Button>
        ))}
      </div>

      <span style={label}>Flock</span>
      <div style={row}>
        {FLOCK_SIZES.map((size) => (
          <Button key={size} on={size === lab.flockSize} onClick={() => lab.setFlockSize(size)}>
            {String(size)}
          </Button>
        ))}
      </div>

      <span style={label}>Turntable</span>
      <div style={row}>
        <Button on={lab.spinning} onClick={() => lab.setSpinning(!lab.spinning)}>
          {lab.spinning ? 'Spinning' : 'Spin'}
        </Button>
      </div>
      <Slider name="Bearing" value={lab.orbit} min={-Math.PI} max={Math.PI} step={0.01} suffix=" rad" onChange={lab.setOrbit} />
      <Slider name="Distance" value={lab.distance} min={2} max={200} step={1} suffix=" m" onChange={lab.setDistance} />
      <Slider name="Height" value={lab.height} min={0.3} max={60} step={0.1} suffix=" m" onChange={lab.setHeight} />

      <span style={label}>Treadmill</span>
      <div style={row}>
        <Button on={lab.walking} onClick={() => lab.setWalking(!lab.walking)}>
          {lab.walking ? 'Walking' : 'Walk'}
        </Button>
        <Button on={lab.sprinting} onClick={() => lab.setSprinting(!lab.sprinting)}>Sprint</Button>
      </div>
      <div style={row}>
        <Button on={lab.turnRate < 0} onClick={() => lab.setTurnRate(lab.turnRate < 0 ? 0 : -1)}>Left</Button>
        <Button on={lab.turnRate === 0} onClick={() => lab.setTurnRate(0)}>Straight</Button>
        <Button on={lab.turnRate > 0} onClick={() => lab.setTurnRate(lab.turnRate > 0 ? 0 : 1)}>Right</Button>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '11px', opacity: 0.55 }}>
        The treadmill holds the bound keys down, so the dog moves through the
        real controller. With it off, the keyboard drives as usual.
      </p>

      <span style={label}>Cost</span>
      <dl style={{ margin: 0, fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '3px' }}>
        <dt style={{ opacity: 0.6 }}>Backend</dt><dd style={{ margin: 0 }}>{lab.backend}</dd>
        <dt style={{ opacity: 0.6 }}>Draw calls</dt><dd style={{ margin: 0 }}>{lab.counters.drawCalls}</dd>
        <dt style={{ opacity: 0.6 }}>Triangles</dt><dd style={{ margin: 0 }}>{lab.counters.triangles.toLocaleString('en-US')}</dd>
        <dt style={{ opacity: 0.6 }}>Geometries</dt><dd style={{ margin: 0 }}>{lab.counters.geometries}</dd>
        <dt style={{ opacity: 0.6 }}>Textures</dt><dd style={{ margin: 0 }}>{lab.counters.textures}</dd>
        <dt style={{ opacity: 0.6 }}>Frame gap</dt><dd style={{ margin: 0 }}>{lab.counters.frameMs.toFixed(1)} ms</dd>
        <dt style={{ opacity: 0.6 }}>Camera</dt>
        <dd style={{ margin: 0 }}>{lab.counters.camera.map((n) => n.toFixed(1)).join(', ')}</dd>
      </dl>
      <p style={{ margin: '8px 0 0', fontSize: '11px', opacity: 0.5 }}>
        Frame gap is this workstation, not evidence. Force the WebGL2 backend
        with ?debug=webgl.
      </p>
    </aside>
  );
}
