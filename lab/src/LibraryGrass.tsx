// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The standalone grass library, mounted beside the shipped grass for comparison.
 *
 * `threejs-field-grass` is the extracted MIT package (aliased to a sibling
 * checkout in `vite.lab.config.ts`, absent from `package.json`, unreachable
 * from any production build). This component exists to answer one question
 * honestly: is the library a drop-in replacement for `scene/GrassField`?
 *
 * WHAT IS HELD IDENTICAL, so the difference on screen is the implementation and
 * nothing else:
 *
 *  - the same bytes. `useTufts()` is the game's own loader, so both subjects
 *    draw the same committed scatter from `assets/grass/tufts.bin`.
 *  - the same decode. The two `decodeTufts` differ by one divisor (the library
 *    scales yaw by 65535, the game by 65536, which is the correct divisor for a
 *    wrapping angle); the resulting yaw differs by at most 1e-4 rad.
 *  - the same blade mesh. `tuftGeometry` is character-identical bar its RNG
 *    import path, and the two `mulberry32` implementations were verified to
 *    produce the same sequence, so the per-blade jitter matches.
 *  - the same tuft counts and spread, read from the game's `GRASS_PRESETS` for
 *    the live tier, and the same two groups: `field` with interaction,
 *    `surround` without.
 *  - the same draw order and the same refusal to cull.
 *
 * WHAT CANNOT BE HELD IDENTICAL, which is the finding this subject is for:
 *
 *  - INTERACTION IS A DIFFERENT ARCHITECTURE. The game packs interactor records
 *    and a cell-to-slot index, and the shader evaluates four oriented footprint
 *    SDFs per vertex. The library rasterises a deformation vector field on the
 *    CPU and the shader samples one linearly-filtered texel. Same footprint
 *    numbers, opposite side of the bus.
 *  - THERE IS NO BARK. The library has no bark wave and no reduced-motion path,
 *    so no `BarkRing` is mounted here. That absence is deliberate and visible
 *    rather than papered over with the game's own ring.
 *  - PRESSED GRASS KEEPS ITS WIND. The game masks the wind octaves and the
 *    flutter where a tuft is pressed; the library does not.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  FIELD_GRASS_PRESET,
  FIELD_TUFT,
  SURROUND_TUFT,
  createGrassLayer,
  createInteractionField,
  decodeTufts,
  groupFromManifest,
  type GrassInteractor,
  type GrassLayer,
  type GrassManifest as LibraryManifest,
  type InteractionField as LibraryInteraction,
} from 'threejs-field-grass';
import { useGameStore } from '@app/state/store';
import { resolvedRenderTier } from '@app/quality/autoTier';
import { GRASS_PRESETS } from '@app/scene/grass/density';
import { GRASS_MANIFEST, useTufts } from '@app/scene/grass/tuftData';
import {
  GRID_HALF_EXTENT,
  MAX_AGE,
  MAX_INTERACTION_SHEEP,
} from '@app/scene/grass/interactionField';

/**
 * The game's manifest, retyped for the library.
 *
 * The two interfaces describe the same JSON; the library declares `version`,
 * `format` and `stride` as literals where the game declares them as widths, so
 * the structural check fails on types that the values satisfy. The assertion
 * below is what actually protects the comparison: if the committed manifest
 * ever stops being the format the library decodes, this throws instead of
 * drawing something subtly wrong.
 */
function libraryManifest(): LibraryManifest {
  const { version, format, stride } = GRASS_MANIFEST;
  if (version !== 1 || format !== 'tuft12' || stride !== 12) {
    throw new Error(
      'threejs-field-grass decodes tuft12 v1 stride 12; '
      + 'assets/grass/manifest.json declares ' + format + ' v' + version + ' stride ' + stride,
    );
  }
  return GRASS_MANIFEST as unknown as LibraryManifest;
}

/**
 * The deformation grid, in metres.
 *
 * The library's own default is a 0.5 m cell over a 100 m square: 40,000 cells,
 * cleared and finalised in full every frame. This field is 212.5 m square, so
 * the same cell size would be 180,625 cells and the comparison would be about
 * one config line rather than about the two designs. One metre keeps the grid
 * at 45,156 cells, which is the library's own per-frame budget over the field
 * it is being asked to cover. The cost of that choice is visible: a wake
 * smoothed across a metre, against the game's per-vertex footprint edge.
 */
const LIBRARY_CELL = 1;

/** One mutable record per body. Rebuilt in place; the frame allocates nothing. */
interface Body {
  slot: number;
  x: number;
  z: number;
  heading: number;
  kind: 0 | 1;
}

export function LibraryGrass() {
  const sim = useGameStore((state) => state.sim);
  const quality = useGameStore((state) => state.quality);
  const autoTierReceipt = useGameStore((state) => state.autoTierReceipt);
  const records = useTufts();
  const density = GRASS_PRESETS[resolvedRenderTier(quality, autoTierReceipt)];

  const interaction = useMemo<LibraryInteraction>(
    () => createInteractionField({
      minX: -GRID_HALF_EXTENT,
      maxX: GRID_HALF_EXTENT,
      minZ: -GRID_HALF_EXTENT,
      maxZ: GRID_HALF_EXTENT,
      cellSize: LIBRARY_CELL,
      // The dog plus every sheep the game's own field will take.
      maxBodies: MAX_INTERACTION_SHEEP + 1,
      // The game gives the dog 11 wake samples and each sheep 4; the library
      // has one budget for every body, so this sits between them.
      ghostsPerBody: 8,
      maxAge: MAX_AGE,
    }),
    [],
  );

  const layers = useMemo<readonly GrassLayer[]>(() => {
    const manifest = libraryManifest();
    const field = groupFromManifest(manifest, 'field');
    const surround = groupFromManifest(manifest, 'surround');
    return [
      createGrassLayer(
        decodeTufts(records, manifest, field, Math.round(field.count * density.field), density.spread),
        { preset: FIELD_GRASS_PRESET, shape: FIELD_TUFT, interaction, name: 'library-grass-field' },
      ),
      createGrassLayer(
        decodeTufts(records, manifest, surround, Math.round(surround.count * density.surround), density.spread),
        { preset: FIELD_GRASS_PRESET, shape: SURROUND_TUFT, interaction: null, name: 'library-grass-surround' },
      ),
    ];
  }, [records, density, interaction]);

  // Drawn before the animals, as the shipped field is.
  useEffect(() => {
    for (const layer of layers) layer.mesh.renderOrder = -1;
  }, [layers]);

  useEffect(() => () => {
    for (const layer of layers) layer.dispose();
  }, [layers]);

  useEffect(() => () => interaction.dispose(), [interaction]);

  // One record for the dog and one per sheep the field will accept, allocated
  // once. `live.length` is moved rather than the array rebuilt.
  const pool = useRef<Body[]>(
    Array.from({ length: MAX_INTERACTION_SHEEP + 1 }, (_, slot): Body => ({
      slot,
      x: 0,
      z: 0,
      heading: 0,
      kind: slot === 0 ? 0 : 1,
    })),
  );
  const live = useRef<GrassInteractor[]>([]);

  // Default priority, as the shipped field: after the sim step at -1 and before
  // the post chain takes the frame at +1.
  useFrame((_, delta) => {
    const bodies = pool.current;
    const out = live.current;
    out.length = 0;

    const dog = bodies[0];
    if (dog !== undefined && sim.dogHeadings.length > 0) {
      dog.x = sim.dogPositions[0] ?? 0;
      dog.z = sim.dogPositions[1] ?? 0;
      dog.heading = sim.dogHeadings[0] ?? 0;
      out.push(dog);
    }

    const sheep = Math.min(sim.headings.length, MAX_INTERACTION_SHEEP);
    for (let i = 0; i < sheep; i++) {
      const body = bodies[i + 1];
      if (body === undefined) break;
      body.x = sim.positions[i * 2] ?? 0;
      body.z = sim.positions[i * 2 + 1] ?? 0;
      body.heading = sim.headings[i] ?? 0;
      out.push(body);
    }

    interaction.update(delta, out);
  });

  return (
    <>
      {layers.map((layer) => (
        <primitive key={layer.mesh.uuid} object={layer.mesh} />
      ))}
    </>
  );
}
