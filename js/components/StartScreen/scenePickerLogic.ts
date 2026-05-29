/**
 * ScenePicker pure logic.
 *
 * The picker's testable decisions, factored out of the React component so they
 * can be unit-tested without a DOM: display ordering, URL→scene resolution, the
 * debounced-commit predicate, latest-wins coalescing, index wrap, and the swipe
 * threshold. No React, no GameBridge, no `location` — every input is a plain arg.
 *
 * Cycle 47 P5: extracted from ScenePicker.js ahead of the .tsx conversion.
 */

/** Fixed display order, independent of scene-registry insertion order. */
export const ORDER = ['rolling-hills', 'open-country', 'field'] as const;

/** Sort scenes into the fixed display order. Unknown ids sort last (-1 index). */
export function orderScenes<T extends { id: string }>(scenes: readonly T[]): T[] {
    return [...scenes].sort((a, b) => ORDER.indexOf(a.id as never) - ORDER.indexOf(b.id as never));
}

/**
 * Resolve the active scene id from a URL search string. Returns the `scene`
 * query param when it names a known scene, otherwise the default.
 */
export function resolveSceneId(search: string, validIds: readonly string[], defaultId: string): string {
    const fromUrl = new URLSearchParams(search).get('scene');
    return fromUrl && validIds.includes(fromUrl) ? fromUrl : defaultId;
}

/**
 * Should a debounced commit actually fire a swap? A null target never fires.
 * Re-picking the scene already on screen is a no-op UNLESS the zen attract
 * field is still up (the scene def matches but nothing is built yet, so the
 * default-scene pick must still commit to build it and leave attract mode).
 */
export function shouldCommit(targetId: string | null, currentId: string, attractActive: boolean): boolean {
    if (!targetId) return false;
    if (targetId === currentId && !attractActive) return false;
    return true;
}

/**
 * Given a commit that should fire, and whether a swap is already running,
 * decide whether to queue it (latest-wins) or fire it now.
 */
export function commitAction(swapInFlight: boolean): 'queue' | 'fire' {
    return swapInFlight ? 'queue' : 'fire';
}

/**
 * On scene-swap-end, decide whether to dispatch a queued (pending) swap. Fires
 * only when a pending target exists and differs from the now-active scene (the
 * user flipped away and back drops the pending entry).
 */
export function pendingDispatch(pendingTarget: string | null, currentId: string): boolean {
    return !!pendingTarget && pendingTarget !== currentId;
}

/** Wrap an index by a +1/-1 (or larger) delta over `length` cards. */
export function flipIndex(current: number, delta: number, length: number): number {
    return (current + delta + length) % length;
}

/**
 * Map a horizontal touch gesture to a flip delta. A swipe qualifies on either
 * 40px of travel or a fast flick (>0.4 px/ms). Swipe left (dx<0) advances to
 * the next card (+1); swipe right (dx>0) goes back (-1); otherwise 0 (no flip).
 */
export function swipeDirection(dx: number, dt: number): -1 | 0 | 1 {
    const fast = Math.abs(dx) / Math.max(1, dt) > 0.4;
    if (Math.abs(dx) > 40 || fast) return dx < 0 ? 1 : -1;
    return 0;
}
