// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fence's one material, in two kinds. Both compile from this single TSL
 * source to WGSL and GLSL, so the WebGPU and WebGL2 backends draw the same fence
 * with no per-backend fork.
 *
 * WEATHERED, NOT PAINTED, AND LIT FROM ABOVE. The value ladder is the whole
 * asset: the top face of every rail and the chamfered head of every post is the
 * lightest and warmest thing on the piece, the vertical faces sit a band down,
 * and the undersides fall into a cool hue-shifted shadow. Both gameplay cameras
 * look DOWN at this fence, so the faces they see most have to be the ones the
 * light is on, and 800 m of perimeter then reads as one continuous drawn line
 * across the field rather than as a dark scribble.
 *
 * How that ladder is built, and why it is not a plain half-lambert under an 8
 * degree sun, is in timberBands.ts. What each band should LOOK like is in
 * timberTones.ts, authored as on-screen targets and solved backwards through the
 * post chain, so the numbers a critic samples are the numbers in the table.
 *
 * The instance attribute is a vec4 read by kind:
 *   post: (seed, tone index, height m, girth m)
 *   rail: (seed, topness 0..1, span m, tone index)
 * A second vec3 carries inverse instance scale for the outline displacement,
 * while uv.x is 0 on the surface and 1 on its reversed hull.
 */

import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  color,
  float,
  fract,
  instancedBufferAttribute,
  length,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { bandedTimber, screenTone, sideness, timberLevel } from './timberBands';
import {
  AERIAL,
  AERIAL_FAR,
  AERIAL_GATE_DAMP,
  AERIAL_MAX,
  AERIAL_NEAR,
  ARRIS,
  ARRIS_LIFT,
  BANDS,
  BLEACH_SPREAD,
  COLLAR,
  COLLAR_LIFT,
  GRAIN,
  HEAD,
  HEAD_LIFT,
  OUTLINE,
  RAIL_SECTION,
  SOIL,
  SOIL_HEIGHT,
  SOIL_NOISE,
  SOIL_STRENGTH,
  SOIL_WOBBLE,
  UNDER,
  UNDER_DROP,
} from './timberTones';

export type TimberKind = 'post' | 'rail';

/**
 * Compact painted breakup for stock that is already faceted and banded.
 *
 * MaterialX noise expands into a large helper library in every distinct fence
 * pipeline. Fence instances only need stable lengthwise brush variation, so a
 * pair of incommensurate sine projections gives the same broad/fine read while
 * keeping the generated shader small enough to compile before play.
 */
function paintedWave(point: TSLNode, frequency: readonly [number, number, number], phase: TSLNode): TSLNode {
  return sin(
    point.x.mul(float(frequency[0]))
      .add(point.y.mul(float(frequency[1])))
      .add(point.z.mul(float(frequency[2])))
      .add(phase),
  );
}

/** 1 where a tone index equals `n`, 0 elsewhere. A box rather than a ramp,
 *  because iron is not on the line between two woods. */
function atIndex(index: TSLNode, n: number): TSLNode {
  return smoothstep(float(n - 0.6), float(n - 0.4), index).mul(
    float(1).sub(smoothstep(float(n + 0.4), float(n + 0.6), index)),
  );
}

/**
 * Brushwork: slow along the piece, faster across it, then CUT into three discrete
 * tones with hard edges. What lands on a board is a handful of confident
 * lengthwise strokes at three values rather than a blur, and the frequencies are
 * chosen so a stroke is several pixels wide at the near camera instead of the
 * sub-pixel static that read as rot.
 */
function grain(kind: TimberKind, timber: TSLNode, up01: TSLNode): TSLNode {
  const across = kind === 'post' ? GRAIN.postAcross : GRAIN.railAcross;
  const point =
    kind === 'post'
      ? vec3(
          positionLocal.x.mul(timber.w).mul(float(across)),
          up01.mul(timber.z).mul(float(GRAIN.along)),
          positionLocal.z.mul(timber.w).mul(float(across)),
        )
      : vec3(
          positionLocal.x.mul(timber.z).mul(float(GRAIN.along)),
          positionLocal.y.mul(float(RAIL_SECTION * across)),
          positionLocal.z.mul(float(RAIL_SECTION * across)),
        );
  // Offset per instance, or every stick in the run shows the same board.
  const seed = timber.x;
  const p = point.add(vec3(seed.mul(float(53.1)), seed.mul(float(19.7)), seed.mul(float(31.9))));
  const raw = paintedWave(p, [0.83, 1.17, 0.61], seed.mul(float(4.73)))
    .mul(float(GRAIN.coarse))
    .add(
      paintedWave(
        p.mul(vec3(...GRAIN.octave)),
        [1.31, 0.73, 1.67],
        seed.mul(float(9.11)).add(float(1.9)),
      ).mul(float(GRAIN.fine)),
    );
  const cut = (level: number): TSLNode =>
    smoothstep(float(level - GRAIN.edge), float(level + GRAIN.edge), raw);
  // 0, 0.5, 1: three tones, two hard edges between them.
  return cut(GRAIN.cutLow).add(cut(GRAIN.cutHigh)).mul(float(0.5));
}

export function makeTimberMaterial(
  data: THREE.InstancedBufferAttribute,
  inverse: THREE.InstancedBufferAttribute,
  kind: TimberKind,
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const timber: TSLNode = instancedBufferAttribute(data, 'vec4');
  const inverseScale: TSLNode = instancedBufferAttribute(inverse, 'vec3');
  const outlineMask = step(float(0.5), uv().x);
  const seed = timber.x;
  const up01 = positionLocal.y.add(float(0.5));

  // A post is line stock, pier shaft or pier head; a rail is line, leaf, iron or
  // pier head. One index, four boxes, no second material.
  const toneIndex = kind === 'post' ? timber.y : timber.w;
  const isLine = atIndex(toneIndex, 0);
  const isGate = kind === 'post' ? atIndex(toneIndex, 1) : float(0);
  const isCap = atIndex(toneIndex, kind === 'post' ? 2 : 3);
  const isIron = kind === 'post' ? float(0) : atIndex(toneIndex, 2);
  const isLeaf = kind === 'post' ? float(0) : atIndex(toneIndex, 1);

  // The local light terms. A vertical face takes a lit strip along its top arris
  // and a cool one under its bottom; a post takes a chamfered head instead, since
  // on a 1.9 m shaft an arris measured in local height would be 38 cm of timber.
  const side = sideness();
  const arris =
    kind === 'rail'
      ? smoothstep(float(ARRIS[0]), float(ARRIS[1]), positionLocal.y).mul(side)
      : smoothstep(float(HEAD[0]), float(HEAD[1]), positionLocal.y);
  const lift = kind === 'rail' ? arris.mul(float(ARRIS_LIFT)) : arris.mul(float(HEAD_LIFT));
  const collar = kind === 'post'
    ? smoothstep(float(COLLAR[0]), float(COLLAR[1]), up01).mul(isGate).mul(float(COLLAR_LIFT))
    : float(0);
  const drop = smoothstep(float(UNDER[0]), float(UNDER[1]), positionLocal.y.negate())
    .mul(side)
    .mul(float(UNDER_DROP));

  const level = timberLevel(lift.add(collar), drop);

  // One banded surface per stock, selected by the index. Four mixes rather than
  // four materials: the gate costs instances, never a draw call.
  const banded =
    kind === 'post'
      ? bandedTimber(BANDS.line!, level)
          .mul(isLine)
          .add(bandedTimber(BANDS.gate!, level).mul(isGate))
          .add(bandedTimber(BANDS.cap!, level).mul(isCap))
      : bandedTimber(BANDS.line!, level)
          .mul(isLine)
          .add(bandedTimber(BANDS.leaf!, level).mul(isLeaf))
          .add(bandedTimber(BANDS.iron!, level).mul(isIron))
          .add(bandedTimber(BANDS.cap!, level).mul(isCap));

  // Only line stock has been left out to silver, and only a little: this is one
  // board weathering faster than its neighbour, not a second material.
  const bleach = fract(seed.mul(float(13.37)))
    .sub(float(0.5))
    .mul(float(2 * BLEACH_SPREAD))
    .mul(isLine);
  const grain01 = grain(kind, timber, up01);
  let wood = banded
    .mul(float(1).add(bleach))
    .mul(mix(float(GRAIN.low), float(GRAIN.high), grain01));

  if (kind === 'post') {
    const wobblePoint = vec3(
      positionWorld.x.mul(float(SOIL_NOISE)),
      positionWorld.z.mul(float(SOIL_NOISE)),
      seed.mul(float(7.3)),
    );
    const wobble = paintedWave(
      wobblePoint,
      [0.91, 1.37, 0.77],
      seed.mul(float(3.17)),
    );
    // `timber.z` is the post's own height, so this is metres above the foot and
    // a pier gets the same 20 cm collar a line post does.
    const metres = up01.mul(timber.z);
    const top = float(SOIL_HEIGHT).add(wobble.mul(float(SOIL_WOBBLE)));
    const stain = float(1).sub(smoothstep(float(0), top, metres));
    wood = wood.mul(mix(vec3(1, 1, 1), vec3(...SOIL), stain.mul(float(SOIL_STRENGTH))));
  }

  // The gate keeps more of itself at range than the line does. It is the thing
  // the field is read against, and haze that erases it at 140 m erases the
  // landmark exactly where a player is looking for it.
  const damp =
    kind === 'post'
      ? float(1).sub(isGate.add(isCap).mul(float(AERIAL_GATE_DAMP)))
      : float(1).sub(isCap.mul(float(AERIAL_GATE_DAMP)));
  const aerial = aerialAmount();
  const surfaceColor = mix(wood, color(screenTone(AERIAL)), aerial.mul(damp));
  const outlineColor = mix(
    color(screenTone(OUTLINE)),
    color(screenTone(AERIAL)),
    aerial,
  );
  material.positionNode = positionLocal.add(
    normalLocal.mul(inverseScale).mul(float(OUTLINE_WIDTH)).mul(outlineMask),
  );
  material.colorNode = mix(surfaceColor, outlineColor, outlineMask);
  return material;
}

/** How much of the far haze this fragment has taken. */
function aerialAmount(): TSLNode {
  const viewDistance = length(positionWorld.sub(cameraPosition));
  return smoothstep(float(AERIAL_NEAR), float(AERIAL_FAR), viewDistance).mul(float(AERIAL_MAX));
}

/**
 * How far the outline hull stands off the timber, metres, at every point on it.
 *
 * Down by a third. The line has to survive the Follow camera without eating the
 * asset at the near one: at 12 m a centimetre and a half of shell is drawn on
 * BOTH edges of a 9 cm rail, which is a third of the board spent on its own
 * outline, and it is why the run measured as alternating light and near-black
 * stripes rather than as timber.
 */
export const OUTLINE_WIDTH = 0.009;
