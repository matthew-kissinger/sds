// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { barkPressed, toggleCameraMode } from './actions';
import {
  beginTouchStick,
  endAllTouch,
  endTouchStick,
  setTouchOffset,
  setTouchSprint,
  STICK_RADIUS,
  touchStickPixels,
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
  const sprintPointerId = useRef<number | null>(null);
  const sprintKeys = useRef(new Set<string>());
  const sprintRef = useRef<HTMLButtonElement>(null);
  // Where the thumb landed. Everything the stick knows is measured from here;
  // the base it drifts to belongs to `touch.ts` and is read back to draw.
  const landed = useRef({ x: 0, y: 0 });

  // The one place the stick is drawn, from the device's own numbers. Called
  // once after a coalesced batch, so the cost is three style writes per batch
  // rather than growing with the sample count the way a per-sample draw did.
  const drawStick = useCallback(() => {
    const stick = touchStickPixels();
    const ring = ringRef.current;
    const knob = knobRef.current;
    if (ring) {
      ring.style.left = `${landed.current.x + stick.baseX}px`;
      ring.style.top = `${landed.current.y + stick.baseY}px`;
    }
    if (knob) knob.style.transform = `translate(${stick.knobX}px, ${stick.knobY}px)`;
  }, []);

  const releaseStick = useCallback(() => {
    pointerId.current = null;
    endTouchStick();
    drawStick();
    const ring = ringRef.current;
    if (ring) ring.style.opacity = '0';
  }, [drawStick]);

  const syncSprint = useCallback(() => {
    const active = sprintPointerId.current !== null || sprintKeys.current.size > 0;
    setTouchSprint(active);
    if (sprintRef.current) {
      sprintRef.current.dataset.active = String(active);
      sprintRef.current.setAttribute('aria-pressed', String(active));
    }
  }, []);

  const releaseSprintPointer = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (sprintPointerId.current !== event.pointerId) return;
    sprintPointerId.current = null;
    syncSprint();
  }, [syncSprint]);

  const releaseSprint = useCallback(() => {
    sprintPointerId.current = null;
    sprintKeys.current.clear();
    syncSprint();
  }, [syncSprint]);

  const releaseAll = useCallback(() => {
    releaseStick();
    releaseSprint();
    endAllTouch();
  }, [releaseSprint, releaseStick]);

  useEffect(() => {
    const releaseOnHide = () => {
      if (document.visibilityState !== 'visible') releaseAll();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseOnHide);
    return () => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseOnHide);
      releaseAll();
    };
  }, [releaseAll]);

  // Removing a captured control can retarget lostpointercapture to document,
  // so its React handler is not a reliable release path. Clear device state
  // when controls leave play, before a subsequent resume can sample it.
  useLayoutEffect(() => {
    if (!present || gamePhase !== 'playing') releaseAll();
  }, [gamePhase, present, releaseAll]);

  if (!present || gamePhase !== 'playing') return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null) return;
    pointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic probe can provide an already-released pointer.
    }
    landed.current.x = event.clientX;
    landed.current.y = event.clientY;
    beginTouchStick();
    drawStick();
    const ring = ringRef.current;
    if (ring) ring.style.opacity = '1';
  };

  // The stick belongs to the pointer that started it, and no other pointer's
  // lifecycle may end it. A second finger anywhere in the left half - a resting
  // palm edge, a thumb crossing to Sprint or Bark - raises its own up or cancel
  // on this same zone, and an unconditional release there ended a stick the
  // player was still holding, with no way back until that thumb lifted and
  // pressed again. On a phone that reads as the dog stopping dead mid-run.
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    releaseStick();
  };

  // The device is handed the offset from where the thumb LANDED, unclamped: it
  // owns the rim, and it has to see the thumb's own speed to choose a cutoff.
  // See the ordering note in `touch.ts`.
  const sample = (clientX: number, clientY: number, timeMs: number) => {
    setTouchOffset(clientX - landed.current.x, clientY - landed.current.y, timeMs);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    const native = event.nativeEvent;
    // Every coalesced sample, in order, each with its own timestamp. Reading
    // only the last one and discarding the rest would be free if the filter
    // were fixed, but its cutoff is a function of an estimated speed and that
    // estimate needs the intermediate samples. It costs two extra multiplies
    // per dropped frame. Older engines report no coalescing at all.
    const coalesced = typeof native.getCoalescedEvents === 'function'
      ? native.getCoalescedEvents()
      : null;
    if (coalesced !== null && coalesced.length > 0) {
      for (let i = 0; i < coalesced.length; i++) {
        const point = coalesced[i]!;
        sample(point.clientX, point.clientY, point.timeStamp);
      }
    } else {
      sample(native.clientX, native.clientY, native.timeStamp);
    }

    drawStick();
  };

  const onSprintDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (sprintPointerId.current !== null) return;
    sprintPointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic probe can provide an already-released pointer.
    }
    syncSprint();
  };

  return (
    <>
      <div
        className="herd-touch-zone"
        data-testid="touch-stick-zone"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
      >
        <div
          ref={ringRef}
          className="herd-touch-ring"
          style={{ '--herd-stick-radius': `${STICK_RADIUS}px` } as React.CSSProperties}
          data-testid="touch-stick"
        >
          <div ref={knobRef} className="herd-touch-knob" />
        </div>
      </div>
      <button
        ref={sprintRef}
        type="button"
        className="herd-sprint-button"
        data-active="false"
        data-testid="sprint-button"
        aria-label="Hold to sprint"
        aria-pressed="false"
        onPointerDown={onSprintDown}
        onPointerUp={releaseSprintPointer}
        onPointerCancel={releaseSprintPointer}
        onLostPointerCapture={releaseSprintPointer}
        onKeyDown={(event) => {
          if (event.code !== 'Space' && event.code !== 'Enter') return;
          event.preventDefault();
          sprintKeys.current.add(event.code);
          syncSprint();
        }}
        onKeyUp={(event) => {
          if (event.code !== 'Space' && event.code !== 'Enter') return;
          event.preventDefault();
          sprintKeys.current.delete(event.code);
          syncSprint();
        }}
        onBlur={() => {
          sprintKeys.current.clear();
          syncSprint();
        }}
      >
        Sprint
      </button>
      <button
        type="button"
        className="herd-bark-button"
        data-testid="bark-button"
        aria-label="Bark"
        onPointerDown={barkPressed}
        // Pointer input fires immediately above; keyboard/assistive clicks
        // have no pointer-down event and must activate the same action once.
        onClick={(event) => { if (event.detail === 0) barkPressed(); }}
      >
        Bark
      </button>
      <button
        type="button"
        className="herd-camera-button"
        data-testid="camera-button"
        aria-label="Change camera"
        onPointerDown={toggleCameraMode}
        onClick={(event) => { if (event.detail === 0) toggleCameraMode(); }}
      >
        Camera
      </button>
    </>
  );
}
