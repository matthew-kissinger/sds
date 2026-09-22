// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Vector4 } from 'three/webgpu';
import { HOME_FIELD } from '@sim/field';
import { useGameStore } from '@app/state/store';
import { useHeightfield } from '@app/world/heightfield';
import { aimAtGate, gateScreenAngle } from '@app/ui/gateProjection';
import { GateOpeningMarker } from './GateOpeningMarker';
import { GATE_OPENING_LIFT } from './gateOpeningGeometry';

/** The terrain walk answers a slow boolean, so it keeps its old 20 Hz. */
const OCCLUSION_INTERVAL = 0.05;

/**
 * Gate guidance splits its work by how fast each part actually changes.
 *
 * The cue's position is driven entirely by camera motion, which is per-frame,
 * so the projection and the transform write are per-frame too. They go
 * straight to the element: the store has 74 selector call sites, and waking
 * all of them sixty times a second to move one badge is not a trade worth
 * making.
 *
 * Everything the store still carries - now only whether the opening is in
 * frame and whether a ridge stands in front of it - changes a few times a
 * second at most, so it is published only when one of those actually differs.
 * The metres are gone: the cue draws its distance on the rim instead.
 */
export function GateGuidance() {
  const field = useHeightfield();
  const elapsed = useRef(0);
  const obscured = useRef(false);
  const anchorEl = useRef<HTMLElement | null>(null);
  const publishedKey = useRef('');
  // Presence and the rim arc move at walking pace, so they are written only
  // when they have actually moved. The transform and the needle are camera
  // work and go out every frame.
  const shownPresence = useRef(-1);
  const shownRange = useRef(-1);
  const scratch = useMemo(() => ({
    clip: new Vector4(), target: new Vector3(), forward: new Vector3(),
  }), []);

  useFrame(({ camera, size }, dt) => {
    const state = useGameStore.getState();
    if (state.gamePhase !== 'playing') {
      if (state.gateIndicator !== null) {
        useGameStore.setState({ gateIndicator: null });
        publishedKey.current = '';
        shownPresence.current = -1;
        shownRange.current = -1;
      }
      return;
    }
    const dog = state.sim.state.dogs[0];
    if (!dog) return;

    const { x, z } = HOME_FIELD.gate.position;
    // Project the opening at the marker's ground level, not above a ridge.
    const target = scratch.target.set(x, field.groundY(x, z) + GATE_OPENING_LIFT, z);

    // The terrain-only visibility approximation is unchanged, just rationed.
    elapsed.current += dt;
    if (elapsed.current >= OCCLUSION_INTERVAL) {
      elapsed.current = 0;
      obscured.current = false;
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const sx = camera.position.x + (x - camera.position.x) * t;
        const sz = camera.position.z + (z - camera.position.z) * t;
        const sy = camera.position.y + (target.y - camera.position.y) * t;
        if (field.groundY(sx, sz) > sy) { obscured.current = true; break; }
      }
    }

    camera.updateMatrixWorld();
    scratch.clip.set(target.x, target.y, target.z, 1)
      .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    // Measured off the CAMERA rather than the dog, and off all three of its
    // axes rather than a ground bearing. The needle is read against the screen,
    // so the screen's own basis is the frame it has to be measured in: a rig
    // that looks down foreshortens the forward axis in the image and leaves the
    // sideways one alone, and a ground bearing written straight to a screen
    // angle misses by up to 39.7 degrees. This is also the line that costs the
    // two camera modes nothing - the basis is whatever the live camera is
    // doing, so Follow at 22.5 degrees and Classic at 44.9 both come out right
    // with no case between them.
    const forward = camera.getWorldDirection(scratch.forward);
    const angle = gateScreenAngle(
      forward.x, forward.y, forward.z,
      x - camera.position.x, target.y - camera.position.y, z - camera.position.z,
    );
    const cue = aimAtGate(scratch.clip, angle, size.width, size.height,
      Math.hypot(dog.position.x - x, dog.position.z - z), obscured.current);

    if (!anchorEl.current) anchorEl.current = document.querySelector('.herd-gate-cue');
    const element = anchorEl.current;
    if (element) {
      // Two decimals, and translate3d rather than translate: the compositor
      // takes this without a layout pass, and a tenth of a CSS pixel is a
      // third of a device pixel at the ratio of 3 a phone draws at. Whole
      // pixels here were a three-device-pixel snap every time the camera
      // drifted across a boundary.
      element.style.transform =
        `translate3d(${cue.x.toFixed(2)}px, ${cue.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
      element.style.setProperty('--gate-angle', `${cue.angle.toFixed(4)}rad`);
      // A quarter of a percent is well under a step anyone can see, and it
      // keeps a still camera from touching the element at all.
      if (Math.abs(cue.presence - shownPresence.current) > 0.0025) {
        shownPresence.current = cue.presence;
        element.style.opacity = cue.presence.toFixed(3);
      }
      if (Math.abs(cue.range - shownRange.current) > 0.0025) {
        shownRange.current = cue.range;
        element.style.setProperty('--gate-range', cue.range.toFixed(3));
      }
    }

    // Republish only when a subscriber's own answer would change. The two
    // booleans are the whole of it; nothing reads a position out of the store.
    const key = `${cue.onScreen}|${cue.obscured}`;
    if (key !== publishedKey.current) {
      publishedKey.current = key;
      useGameStore.setState({
        gateIndicator: { onScreen: cue.onScreen, obscured: cue.obscured },
      });
    }
  });
  return <GateOpeningMarker />;
}
