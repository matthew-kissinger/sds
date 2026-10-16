// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export const SCORE_SCENE_ID = 'field-v3';

// Same origin by default. The sds-worker Worker serves the game and the score
// API from one origin, so requests go to /api/... on whatever host served the
// page: sheepdogsim.com in production, a pull-request alias on the preview
// Worker, and the Vite dev server, where the Cloudflare Vite plugin serves /api.
//
// VITE_SCORE_API_BASE overrides it at build time with an absolute origin, for
// probes and the asset lab that stand up their own score API.
export function scoreApiBase(): string {
  const configured = import.meta.env.VITE_SCORE_API_BASE?.trim();
  return (configured || '').replace(/\/+$/, '');
}
