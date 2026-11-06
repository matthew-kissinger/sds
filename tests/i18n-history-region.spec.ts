// SPDX-License-Identifier: AGPL-3.0-or-later
// A saved match names its region in the words the lobby uses, and a region this
// build does not know still shows, as it was saved.
import { describe, expect, it } from 'vitest';
import en from '../app/src/i18n/locales/en.json';
import { regionName } from '../app/src/multiplayer/HistoryView';

describe('regionName', () => {
  it('uses the lobby\'s words for every region', () => {
    expect(regionName('na')).toBe(en['mp.region.na']);
    expect(regionName('eu')).toBe(en['mp.region.eu']);
    expect(regionName('apac')).toBe(en['mp.region.apac']);
  });

  it('shows a region it does not know as saved', () => {
    expect(regionName('sa')).toBe('SA');
  });
});
