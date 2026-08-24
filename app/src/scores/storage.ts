// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { ScoreIdentity } from './types';

const IDENTITY_KEY = 'sheepdog.score-identity.v1';

function isIdentity(value: unknown): value is ScoreIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return ['persistentId', 'authSecret', 'displayName', 'fullName']
    .every((key) => typeof candidate[key] === 'string' && candidate[key].length > 0);
}
export interface IdentityStorage {
  load(): ScoreIdentity | null;
  save(identity: ScoreIdentity): void;
  clear(): void;
}

export function browserIdentityStorage(): IdentityStorage {
  return {
    load() {
      if (typeof localStorage === 'undefined') return null;
      try {
        const raw = localStorage.getItem(IDENTITY_KEY);
        if (raw === null) return null;
        const value: unknown = JSON.parse(raw);
        return isIdentity(value) ? value : null;
      } catch {
        return null;
      }
    },
    save(identity) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      } catch {
        // Private contexts can refuse storage. Online times remain fail-soft.
      }
    },
    clear() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.removeItem(IDENTITY_KEY);
      } catch {
        // There is no recovery work if storage is unavailable.
      }
    },
  };
}
