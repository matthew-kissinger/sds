// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 117 P1: the pen barrier moved to `shared/PenBarrier.js` and the class
 * is now `PenBarrier`. It was never survival-scoped behaviour - it is a fenced
 * box with one gate, which an island pasture is too - and `scene-and-render.md`
 * says a file names WHAT, not WHEN. This file is a re-export shim so every
 * existing import keeps working under either name.
 */
export { PenBarrier, PenBarrier as PenContainment } from '../PenBarrier.js';
