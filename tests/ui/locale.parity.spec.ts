// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Locale key-parity ratchet.
 *
 * Every non-en locale (es / ja / pt / zh-CN) should eventually carry the full
 * set of en leaf keys. We are NOT inventing translations here, so the locales
 * are currently incomplete. To make this suite pass TODAY without fabricating
 * strings, each locale gets an inline `ALLOWLIST` capturing the exact set of
 * en keys it is missing right now.
 *
 * The allowlist is a RATCHET, enforced in two directions:
 *   1. A key missing from a locale but NOT in its allowlist FAILS the suite
 *      (a newly missing en key, e.g. someone adds an en string and forgets the
 *      locales, gets caught).
 *   2. A key in a locale's allowlist that is no longer missing (it got
 *      translated) ALSO fails, forcing the allowlist to shrink. The allowlist
 *      can only get smaller over time; it can never silently grow.
 *
 * Also guards against "extra" keys: a non-en key absent from en usually means a
 * typo or a stale key that i18next will never resolve.
 *
 * Node environment (no DOM): the locales are plain ESM objects.
 */
import { describe, it, expect } from 'vitest';
import en from '../../js/locales/en/index.js';
import es from '../../js/locales/es/index.js';
import ja from '../../js/locales/ja/index.js';
import pt from '../../js/locales/pt/index.js';
import zhCN from '../../js/locales/zh-CN/index.js';

type LocaleTree = Record<string, unknown>;

/** Flatten a nested locale object to the set of dotted leaf keys. */
function flattenKeys(obj: LocaleTree, prefix = '', out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v as LocaleTree, key, out);
    } else {
      out.add(key);
    }
  }
  return out;
}

const EN_KEYS = flattenKeys(en as LocaleTree);

/**
 * Per-locale snapshot of en keys missing as of 2026-05-31. These are the keys
 * the locale has not been translated for yet. RATCHET: this list may only
 * shrink. Do not add to it - if a locale is missing a key not listed here, the
 * fix is to translate the key (or, if a new en key truly should not be
 * localized, reconsider adding it to en).
 */
const ALLOWLIST: Record<string, readonly string[]> = {
  es: [
    'completion.saveClip',
    'leaderboard.soloChaos',
    'leaderboard.soloInsane',
    'modes.chaos',
    'modes.chaosDesc',
    'modes.insane',
    'modes.insaneDesc',
    'modes.practice',
    'modes.practiceDesc',
    'multiplayer.publicLobbies',
    'multiplayer.publicLobbiesDesc',
    'practice.hint',
    'settings.actions.moveDown',
    'settings.actions.moveLeft',
    'settings.actions.moveRight',
    'settings.actions.moveUp',
    'settings.actions.pause',
    'settings.actions.sprint',
    'settings.gamepadDesc',
    'settings.gamepadSupport',
    'settings.high',
    'settings.keyBindings',
    'settings.keyConflict',
    'settings.low',
    'settings.medium',
    'settings.presets',
    'settings.pressKey',
    'settings.resetBindings',
    'settings.shadowQuality',
    'settings.shadows',
    'settings.shadowsDesc',
    'settings.showStatsDesc',
    'settings.tabs.audio',
    'settings.tabs.controls',
    'settings.tabs.graphics',
  ],
  ja: [
    'completion.saveClip',
    'leaderboard.soloChaos',
    'leaderboard.soloInsane',
    'modes.chaos',
    'modes.chaosDesc',
    'modes.insane',
    'modes.insaneDesc',
    'modes.practice',
    'modes.practiceDesc',
    'multiplayer.publicLobbies',
    'multiplayer.publicLobbiesDesc',
    'practice.hint',
    'settings.actions.moveDown',
    'settings.actions.moveLeft',
    'settings.actions.moveRight',
    'settings.actions.moveUp',
    'settings.actions.pause',
    'settings.actions.sprint',
    'settings.gamepadDesc',
    'settings.gamepadSupport',
    'settings.high',
    'settings.keyBindings',
    'settings.keyConflict',
    'settings.low',
    'settings.medium',
    'settings.presets',
    'settings.pressKey',
    'settings.resetBindings',
    'settings.shadowQuality',
    'settings.shadows',
    'settings.shadowsDesc',
    'settings.showStatsDesc',
    'settings.tabs.audio',
    'settings.tabs.controls',
    'settings.tabs.graphics',
  ],
  pt: [
    'completion.saveClip',
    'leaderboard.soloChaos',
    'leaderboard.soloInsane',
    'modes.chaos',
    'modes.chaosDesc',
    'modes.insane',
    'modes.insaneDesc',
    'modes.practice',
    'modes.practiceDesc',
    'multiplayer.publicLobbies',
    'multiplayer.publicLobbiesDesc',
    'practice.hint',
    'sandbox.countUp',
    'sandbox.countUpDesc',
    'sandbox.countdown',
    'sandbox.countdownDesc',
    'sandbox.drawCustomShape',
    'sandbox.editCustomShape',
    'sandbox.editFenceLayout',
    'sandbox.enableTimer',
    'sandbox.freePlay',
    'sandbox.freePlayDesc',
    'sandbox.herdAllSheep',
    'sandbox.herdAllSheepDesc',
    'sandbox.percentageGoal',
    'sandbox.percentageGoalDesc',
    'sandbox.targetPercentage',
    'sandbox.timeLimit',
    'sandbox.timer',
    'sandbox.winCondition',
    'settings.actions.moveDown',
    'settings.actions.moveLeft',
    'settings.actions.moveRight',
    'settings.actions.moveUp',
    'settings.actions.pause',
    'settings.actions.sprint',
    'settings.gamepadDesc',
    'settings.gamepadSupport',
    'settings.high',
    'settings.keyBindings',
    'settings.keyConflict',
    'settings.low',
    'settings.medium',
    'settings.presets',
    'settings.pressKey',
    'settings.resetBindings',
    'settings.shadowQuality',
    'settings.shadows',
    'settings.shadowsDesc',
    'settings.showStatsDesc',
    'settings.tabs.audio',
    'settings.tabs.controls',
    'settings.tabs.graphics',
  ],
  'zh-CN': [
    'completion.saveClip',
    'leaderboard.soloChaos',
    'leaderboard.soloInsane',
    'modes.chaos',
    'modes.chaosDesc',
    'modes.insane',
    'modes.insaneDesc',
    'modes.practice',
    'modes.practiceDesc',
    'multiplayer.publicLobbies',
    'multiplayer.publicLobbiesDesc',
    'practice.hint',
    'settings.actions.moveDown',
    'settings.actions.moveLeft',
    'settings.actions.moveRight',
    'settings.actions.moveUp',
    'settings.actions.pause',
    'settings.actions.sprint',
    'settings.gamepadDesc',
    'settings.gamepadSupport',
    'settings.high',
    'settings.keyBindings',
    'settings.keyConflict',
    'settings.low',
    'settings.medium',
    'settings.presets',
    'settings.pressKey',
    'settings.resetBindings',
    'settings.shadowQuality',
    'settings.shadows',
    'settings.shadowsDesc',
    'settings.showStatsDesc',
    'settings.tabs.audio',
    'settings.tabs.controls',
    'settings.tabs.graphics',
  ],
};

const LOCALES: Record<string, LocaleTree> = {
  es: es as LocaleTree,
  ja: ja as LocaleTree,
  pt: pt as LocaleTree,
  'zh-CN': zhCN as LocaleTree,
};

describe('locale key parity', () => {
  it('en has a non-trivial key set', () => {
    expect(EN_KEYS.size).toBeGreaterThan(100);
  });

  for (const [name, tree] of Object.entries(LOCALES)) {
    describe(name, () => {
      const localeKeys = flattenKeys(tree);
      const allow = new Set(ALLOWLIST[name]);
      const missing = [...EN_KEYS].filter((k) => !localeKeys.has(k)).sort();
      const extra = [...localeKeys].filter((k) => !EN_KEYS.has(k)).sort();

      it('has no keys absent from en (no typos / stale keys)', () => {
        expect(extra).toEqual([]);
      });

      it('every missing key is covered by the allowlist (ratchet: no new gaps)', () => {
        const newlyMissing = missing.filter((k) => !allow.has(k));
        expect(newlyMissing).toEqual([]);
      });

      it('the allowlist contains only still-missing keys (ratchet: only shrinks)', () => {
        // If a key was translated, it must be removed from the allowlist. This
        // forces the allowlist down toward zero and prevents it from going
        // stale.
        const stale = [...allow].filter((k) => !missing.includes(k)).sort();
        expect(stale).toEqual([]);
      });

      it('allowlisted keys are all valid en keys', () => {
        const bogus = [...allow].filter((k) => !EN_KEYS.has(k)).sort();
        expect(bogus).toEqual([]);
      });
    });
  }
});
