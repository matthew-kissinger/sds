// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export const SCORE_SCENE_ID = 'field-v3';
export const PROD_SCORE_API_BASE = 'https://sds-worker.matt-m-kissinger.workers.dev';

export function scoreApiBase(): string {
  const configured = import.meta.env.VITE_SCORE_API_BASE?.trim();
  return (configured || PROD_SCORE_API_BASE).replace(/\/+$/, '');
}
