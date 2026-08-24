// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('public version 3 surface', () => {
  it('brands the player page and links canonical release metadata', () => {
    const html = read('app/index.html');
    expect(html).toContain('<title>Sheepdog Sim 3 - Browser Herding Game</title>');
    expect(html).toContain('rel="canonical" href="https://sheepdogsim.com/"');
    expect(html).toContain('rel="manifest" href="/site.webmanifest"');
    expect(html).not.toContain('<title>herd</title>');
    expect(read('app/src/ui/Boot.tsx')).toContain('>Sheepdog Sim</h1>');
  });

  it('keeps source and license notices reachable from the game settings', () => {
    const settings = read('app/src/ui/SettingsPanel.tsx');
    expect(settings).toContain('AGPL-3.0-or-later');
    expect(settings).toContain('https://github.com/matthew-kissinger/sds');
    expect(settings).toContain('href="/privacy/"');
  });

  it('ships concise about, support and privacy routes', () => {
    const about = read('app/public/about/index.html');
    const support = read('app/public/support/index.html');
    const privacy = read('app/public/privacy/index.html');
    expect(about).toContain('https://github.com/matthew-kissinger/sds');
    expect(support).toContain('Report a problem');
    expect(privacy).toContain('optional online solo times');
    expect(privacy).toContain('server-issued score identity');
  });

  it('does not advertise deferred launch systems', () => {
    const publicCopy = [
      read('app/index.html'),
      read('app/public/about/index.html'),
      read('app/public/support/index.html'),
    ].join('\n');
    expect(publicCopy).not.toMatch(/5,000|multiplayer/i);
  });

  it('redirects retired version 2 scene pages and publishes the source routes', () => {
    const redirects = read('app/public/_redirects');
    const sitemap = read('app/public/sitemap.xml');
    expect(redirects).toContain('/scenes/* / 301');
    for (const route of ['/', '/about/', '/support/', '/privacy/']) {
      expect(sitemap).toContain(`https://sheepdogsim.com${route}`);
    }
  });
});
