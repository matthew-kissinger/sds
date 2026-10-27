// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('public version 3 surface', () => {
  it('brands the player page and links canonical release metadata', () => {
    const html = read('app/index.html');
    expect(html).toContain('<title>Sheepdog Sim - Free Sheep Herding Browser Game</title>');
    expect(html).toContain('rel="canonical" href="https://sheepdogsim.com/"');
    expect(html).toContain('rel="manifest" href="/site.webmanifest"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('og/sheepdog-sim-v2.png');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="robots" content="index, follow');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type": ["VideoGame", "WebApplication"]');
    expect(html).toContain('"applicationCategory": "GameApplication"');
    expect(html).toContain('"price": "0"');
    expect(html).not.toContain('<title>herd</title>');
    expect(html).not.toContain('Sheepdog Sim 3');
    expect(read('app/src/ui/Boot.tsx')).toContain('>Sheepdog Sim</h1>');
    expect(read('app/src/ui/Boot.tsx')).toContain('role="progressbar"');
    expect(read('app/src/ui/Boot.tsx')).toContain('aria-valuenow={percent}');
    expect(html).toContain('Loading game code');
  });

  it('keeps source and license notices reachable from the game settings', () => {
    const settings = read('app/src/ui/SettingsPanel.tsx');
    expect(settings).toContain('AGPL-3.0-or-later');
    expect(settings).toContain('https://github.com/matthew-kissinger/sds');
    expect(settings).toContain('href="/privacy"');
  });

  it('ships concise about, support and privacy routes', () => {
    const about = read('app/public/about.html');
    const support = read('app/public/support.html');
    const privacy = read('app/public/privacy.html');
    expect(about).toContain('https://github.com/matthew-kissinger/sds');
    expect(support).toContain('Report a problem');
    expect(privacy).toContain('optional online solo times');
    expect(privacy).toContain('server-issued score identity');
    expect(privacy).toContain('Cloudflare Web Analytics');
  });

  it('does not advertise deferred launch systems', () => {
    const publicCopy = [
      read('app/index.html'),
      read('app/public/about.html'),
      read('app/public/support.html'),
    ].join('\n');
    // Multiplayer shipped in 3.8 (release-capabilities.json), so it is no
    // longer a deferred system and the public surface may describe it.
    expect(publicCopy).not.toMatch(/5,000/);
    expect(publicCopy).not.toContain('Sheepdog Sim 3');
  });

  it('ships the day-one touch control surface', () => {
    const controls = read('app/src/input/TouchControls.tsx');
    expect(controls).toContain('data-testid="touch-stick"');
    expect(controls).toContain('data-testid="bark-button"');
    expect(controls).toContain('data-testid="camera-button"');
    expect(controls).toContain('data-testid="sprint-button"');
    expect(controls).toContain('onPointerDown={toggleCameraMode}');
    expect(controls).toContain('onPointerDown={onSprintDown}');
  });

  it('makes solo times reachable before a run', () => {
    const boot = read('app/src/ui/Boot.tsx');
    const board = read('app/src/scores/LeaderboardPanel.tsx');
    expect(boot).toContain('setShowTimes(true)');
    expect(boot).toContain('Times');
    expect(board).toContain('Solo times');
    expect(board).toContain('FLOCK_SIZES.map');
    expect(board).toContain('scoresController.loadBoard');
  });

  it('redirects retired version 2 scene pages and publishes the source routes', () => {
    const redirects = read('app/public/_redirects');
    const sitemap = read('app/public/sitemap.xml');
    expect(redirects).toContain('/scenes/* / 301');
    for (const route of ['/', '/about', '/support', '/privacy']) {
      expect(sitemap).toContain(`https://sheepdogsim.com${route}`);
    }
  });

  it('answers unknown paths with a noindex 404 page and keeps the play paths', () => {
    const notFound = read('app/public/404.html');
    expect(notFound).toContain('<meta name="robots" content="noindex" />');
    expect(notFound).toContain('href="/"');
    expect(notFound).not.toContain('rel="canonical"');
    const rules = read('app/public/_redirects').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
    for (const size of [25, 75, 200]) {
      expect(rules).toContain(`/play/${size} / 200`);
      expect(rules).toContain(`/play/${size}/ / 200`);
    }
    // No catch-all rewrite: that would bring the soft 404 back.
    expect(rules.filter((line) => line.includes('*') && line.trim().endsWith(' 200'))).toEqual([]);
  });

  it('publishes an llms.txt that links only canonical public pages', () => {
    const llms = read('app/public/llms.txt');
    expect(llms).toMatch(/^# Sheepdog Sim\r?\n/);
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    for (const path of ['/', '/play/25', '/play/75', '/play/200', '/support', '/about', '/privacy']) {
      expect(links).toContain(`https://sheepdogsim.com${path}`);
    }
    for (const link of links) expect(link).toMatch(/^https:\/\/(sheepdogsim\.com\/|github\.com\/matthew-kissinger\/sds(\/|$)|instruktlabs\.com\/)/);
  });
});
