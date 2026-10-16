// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export const SCORE_SCENE_ID = 'field-v3';

// Absolute, and cross-origin, because the score Worker answers on its own
// workers.dev hostname while the game is served from sheepdogsim.com. This is
// baked into the bundle at build time, so this hostname must keep answering for
// as long as any built client is in the wild. Making it same-origin is a staged
// change that enables the Worker routes first; docs/operations/deployment.md
// has the order and the two traps.
export const PROD_SCORE_API_BASE = 'https://sds-worker.matt-m-kissinger.workers.dev';

export function scoreApiBase(): string {
  const configured = import.meta.env.VITE_SCORE_API_BASE?.trim();
  return (configured || PROD_SCORE_API_BASE).replace(/\/+$/, '');
}
