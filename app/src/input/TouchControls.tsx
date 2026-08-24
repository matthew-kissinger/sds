// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useCallback, useEffect, useRef, useState } from 'react';
import { barkPressed, toggleCameraMode } from './actions';
import {
  beginTouchStick,
  endTouchStick,
  setTouchStick,
  DEADZONE,
  SPRINT_DEFLECTION,
  STICK_RADIUS,
} from './touch';
import { debugFlags } from '@app/scene/glFactory';
import { useGameStore } from '@app/state/store';

const TOUCH_QUERY = '(pointer: coarse)';

function touchPresent(): boolean {
  return window.matchMedia(TOUCH_QUERY).matches
    || (import.meta.env.DEV && debugFlags().has('touch'));
}

function useTouchPresent(): boolean {
  const [present, setPresent] = useState(touchPresent);
  useEffect(() => {
    const query = window.matchMedia(TOUCH_QUERY);
    const onChange = () => setPresent(touchPresent());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return present;
}

export function TouchControls() {
  const present = useTouchPresent();
  const gamePhase = useGameStore((state) => state.gamePhase);
  const ringRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const release = useCallback(() => {
    pointerId.current = null;
    endTouchStick();
    const ring = ringRef.current;
    const knob = knobRef.current;
    if (ring) {
      ring.style.opacity = '0';
      ring.dataset.sprinting = 'false';
    }
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  }, []);

  useEffect(() => {
    const releaseOnHide = () => {
      if (document.visibilityState !== 'visible') release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', releaseOnHide);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', releaseOnHide);
      release();
    };
  }, [release]);

  if (!present || gamePhase !== 'playing') return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null) return;
    pointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic probe can provide an already-released pointer.
    }
    origin.current = { x: event.clientX, y: event.clientY };
    beginTouchStick();
    const ring = ringRef.current;
    const knob = knobRef.current;
    if (ring) {
      ring.style.left = `${event.clientX}px`;
      ring.style.top = `${event.clientY}px`;
      ring.style.opacity = '1';
    }
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deflection = Math.min(distance / STICK_RADIUS, 1);
    const unitX = distance > 0 ? dx / distance : 0;
    const unitY = distance > 0 ? dy / distance : 0;
    const sprinting = deflection >= SPRINT_DEFLECTION;

    if (deflection < DEADZONE) setTouchStick(0, 0, false);
    else setTouchStick(unitX * deflection, -unitY * deflection, sprinting);

    const travel = deflection * STICK_RADIUS;
    if (knobRef.current) {
      knobRef.current.style.transform =
        `translate(${unitX * travel}px, ${unitY * travel}px)`;
    }
    if (ringRef.current) ringRef.current.dataset.sprinting = String(sprinting);
  };

  return (
    <>
      <div
        className="herd-touch-zone"
        data-testid="touch-stick-zone"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div
          ref={ringRef}
          className="herd-touch-ring"
          style={{ '--herd-stick-radius': `${STICK_RADIUS}px` } as React.CSSProperties}
          data-sprinting="false"
          data-testid="touch-stick"
        >
          <div ref={knobRef} className="herd-touch-knob" />
        </div>
      </div>
      <button
        type="button"
        className="herd-bark-button"
        data-testid="bark-button"
        aria-label="Bark"
        onPointerDown={barkPressed}
      >
        Bark
      </button>
      <button
        type="button"
        className="herd-camera-button"
        data-testid="camera-button"
        aria-label="Change camera"
        onPointerDown={toggleCameraMode}
      >
        Camera
      </button>
    </>
  );
}
