// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import { registerPlayer, submitScore, getLeaderboard, getPlayerScores } from '../../worker/src/d1';
import { formatClock, formatOrdinal, cardDescription } from '../../worker/src/cardCopy';
import { formatIsoWeek, parseIsoWeek, resolveWeek, weekLabel } from '../../worker/src/cardWeek';
import { cardSignatureMatches, parseCardPath, signCardId } from '../../worker/src/cardToken';
import { ownedRunEntries } from '../../worker/src/cardQuery';
import { SAFE_LEFT, SAFE_RIGHT, renderCardPng, useRasterWasm } from '../../worker/src/cardImage';
import worker from '../../worker/src/index';
import { signJwt } from '../../worker/src/jwt';

const SECRET = 'card-test-secret';
const context = { waitUntil() {}, passThroughOnException() {} } as ExecutionContext;

function payload(sheepCount: number, sceneId = 'field-v3') {
  return { sceneId, sheepCount, totalSheep: sheepCount };
}

describe('card copy and weeks', () => {
  it('rounds a tenth without the binary toFixed error', () => {
    expect(formatClock(182.85)).toBe('3:02.9');
    expect(formatClock(77.9)).toBe('1:17.9');
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(22)).toBe('22nd');
    expect(formatOrdinal(113)).toBe('113th');
  });

  it('names a week from its Monday and refuses a week the year does not have', () => {
    const monday = Date.UTC(2026, 9, 19);
    expect(formatIsoWeek(monday)).toBe('2026-W43');
    expect(weekLabel(monday)).toBe('week of 19 Oct');
    expect(weekLabel(Date.UTC(2026, 9, 13))).toBe('week of 12 Oct');
    expect(formatIsoWeek(Date.UTC(2021, 0, 1))).toBe('2020-W53');
    expect(parseIsoWeek('2026-W00')).toBeNull();
    expect(parseIsoWeek('2026-W54')).toBeNull();
    expect(parseIsoWeek('2021-W53')).toBeNull();
    const current = parseIsoWeek('2026-W43');
    const previous = parseIsoWeek('2026-W42');
    expect(current && previous && previous.end).toBe(current?.start);
    const week1 = parseIsoWeek('2026-W01');
    expect(week1 && parseIsoWeek(formatIsoWeek(week1.start - 86_400_000))?.end).toBe(week1?.start);
    expect(resolveWeek('nope', monday)).toBeNull();
    expect(resolveWeek('current', monday)?.token).toBe('2026-W43');
  });

  it('ships the card font as a byte copy of the Piazzolla source', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../../assets/fonts/Piazzolla[opsz,wght].ttf'));
    const copy = readFileSync(resolve(here, '../../app/public/fonts/piazzolla-card.ttf'));
    expect(Buffer.compare(source, copy)).toBe(0);
  });

  it('accepts only a canonical card path and a matching signature', async () => {
    const sig = await signCardId(42, SECRET);
    expect(sig).toHaveLength(43);
    expect(await cardSignatureMatches(42, sig, SECRET)).toBe(true);
    expect(await cardSignatureMatches(43, sig, SECRET)).toBe(false);
    expect(parseCardPath(`/c/42.${sig}`)).toEqual({ id: 42, sig, png: false });
    expect(parseCardPath(`/c/42.${sig}.png`)?.png).toBe(true);
    expect(parseCardPath(`/c/042.${sig}`)).toBeNull();
    expect(parseCardPath('/c/42.short')).toBeNull();
    expect(parseCardPath('/play/25')).toBeNull();
  });
});

describe.skipIf(!sqliteAvailable)('score cards against the real schema', () => {
  let h: TestD1;
  beforeEach(() => { h = createTestD1(); });
  afterEach(() => { h.close(); });

  async function finish(id: string, name: string, score: number, count = 25, sceneId = 'field-v3') {
    await registerPlayer(h.db, id, name, 'custom');
    return submitScore(h.db, id, 'soloClassic', score, payload(count, sceneId));
  }

  function env(assets?: (request: Request) => Promise<Response>) {
    return {
      DB: h.db,
      JWT_SECRET: SECRET,
      ASSETS: { fetch: assets ?? (async () => new Response(null, { status: 404 })) },
    } as any;
  }

  it('returns a share path for a version 3 time and the same ranks the boards use', async () => {
    await registerPlayer(h.db, 'slow', 'QuietHerder', 'custom');
    const faster = await finish('fast', 'SwiftHerd', 40);
    expect(faster.submissionId).toBeGreaterThan(0);
    const token = await signJwt({ persistent_id: 'slow' }, SECRET);
    const response = await worker.fetch(new Request('https://cards.test/api/score', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        gameMode: 'soloClassic',
        score: 90,
        additionalData: payload(25),
      }),
    }), env(), context);
    expect(response.status).toBe(200);
    const body = await response.json() as { sharePath: string; weekRank: number; boardRank: number; weekPlayers: number; boardPlayers: number };
    expect(body.sharePath).toMatch(/^\/c\/\d+\.[A-Za-z0-9_-]{43}$/);
    expect(body.weekPlayers).toBe(2);
    expect(body.boardPlayers).toBe(2);
    expect(body.weekRank).toBe(2);
    expect(body.boardRank).toBe(2);
    const runs = h.query<{ id: number }>('SELECT id FROM score_submissions WHERE persistent_id = ? ORDER BY id', 'slow');
    const entries = await ownedRunEntries(h.db, 'field-v3', await (async () => {
      const { getPlayerScores } = await import('../../worker/src/d1');
      return getPlayerScores(h.db, 'slow', 'field-v3');
    })(), SECRET);
    expect(entries.map((entry) => entry.sharePath).every((path) => path?.startsWith('/c/'))).toBe(true);
    expect(entries).toHaveLength(runs.length);
  });

  it('serves the card to anyone with the link and the same 404 for a bad signature, a flag, and another scene', async () => {
    const saved = await finish('herder', 'A<b>&"', 50);
    const id = saved.submissionId!;
    const sig = await signCardId(id, SECRET);
    const page = await worker.fetch(new Request(`https://cards.test/c/${id}.${sig}`), env(), context);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('A&lt;b&gt;&amp;&quot;');
    expect(html).not.toContain('A<b>');
    expect(html).toContain('og:title');
    expect(html).toContain(`content="https://cards.test/c/${id}.${sig}.png"`);
    expect(html).toContain('summary_large_image');
    expect(html).toContain('href="/play/25"');
    expect(html).toContain('Play 25 sheep');
    expect(html).toContain(cardDescription({
      name: 'A<b>&"',
      sheepCount: 25,
      scoreSeconds: 50,
      allTimeRank: 1,
      allTimePlayers: 1,
      weekRank: 1,
      weekPlayers: 1,
      weekLabel: weekLabel(Date.now()),
    }));
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");

    const wrong = await worker.fetch(new Request(`https://cards.test/c/${id}.${'a'.repeat(43)}`), env(), context);
    expect(wrong.status).toBe(404);
    const wrongHtml = await wrong.text();
    expect(wrongHtml).not.toContain('A&lt;b&gt;');
    expect(wrongHtml).toContain('This run is not on the board.');

    await h.db.prepare('UPDATE score_submissions SET score_anomalies = ? WHERE id = ?').bind('["flagged"]', id).run();
    const flagged = await worker.fetch(new Request(`https://cards.test/c/${id}.${sig}`), env(), context);
    expect(flagged.status).toBe(404);
    expect(await flagged.text()).toBe(wrongHtml);

    const other = await finish('other', 'OtherScene', 80, 200, 'rolling-hills');
    const otherPage = await worker.fetch(
      new Request(`https://cards.test/c/${other.submissionId}.${await signCardId(other.submissionId!, SECRET)}`),
      env(),
      context,
    );
    expect(otherPage.status).toBe(404);
  });

  it('ranks every time in a week that is larger than one query', async () => {
    await registerPlayer(h.db, 'busy', 'BusyHerd', 'custom');
    for (let i = 0; i < 70; i++) await submitScore(h.db, 'busy', 'soloClassic', 100 + i, payload(25));
    const entries = await ownedRunEntries(h.db, 'field-v3', await getPlayerScores(h.db, 'busy', 'field-v3'), SECRET);
    expect(entries).toHaveLength(70);
    expect(entries.every((entry) => entry.sharePath?.startsWith('/c/') && entry.weekRank !== undefined)).toBe(true);
    expect(entries.find((entry) => entry.score === 100)?.weekRank).toBe(1);
    expect(entries.find((entry) => entry.score === 169)?.weekRank).toBe(2);
    expect(entries[0]?.weekPlayers).toBe(1);
  });

  it('keeps this week to rows submitted since Monday and leaves all-time unchanged', async () => {
    await finish('now', 'ThisWeek', 40);
    await finish('then', 'LastWeek', 30);
    const old = Date.UTC(2026, 9, 12, 12);
    await h.db.prepare('UPDATE score_submissions SET submitted_at = ? WHERE persistent_id = ?').bind(old, 'then').run();
    const current = await worker.fetch(
      new Request('https://cards.test/api/leaderboard?mode=solo&scene=field-v3&sheepCount=25&week=current'),
      env(),
      context,
    );
    const currentBody = await current.json() as { entries: { displayName: string }[]; week: string; weekLabel: string };
    expect(currentBody.entries.map((entry) => entry.displayName)).toEqual(['ThisWeek']);
    expect(currentBody.week).toBe(formatIsoWeek(Date.now()));
    expect(currentBody.weekLabel.startsWith('week of ')).toBe(true);

    const allTime = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'field-v3', sheepCount: 25 });
    expect(allTime.map((entry) => entry.displayName)).toEqual(['LastWeek', 'ThisWeek']);

    const bare = await worker.fetch(
      new Request('https://cards.test/api/leaderboard?mode=solo&scene=field-v3&sheepCount=25'),
      env(),
      context,
    );
    expect(Object.keys(await bare.json() as object)).toEqual(['entries']);

    const invalid = await worker.fetch(
      new Request('https://cards.test/api/leaderboard?mode=solo&scene=field-v3&sheepCount=25&week=2026-W54'),
      env(),
      context,
    );
    expect(invalid.status).toBe(400);

    const oldCardId = h.query<{ id: number }>('SELECT id FROM score_submissions WHERE persistent_id = ?', 'then')[0]!.id;
    const oldPage = await worker.fetch(
      new Request(`https://cards.test/c/${oldCardId}.${await signCardId(oldCardId, SECRET)}`),
      env(),
      context,
    );
    expect(await oldPage.text()).toContain('week of 12 Oct');
  });

  it('rasters a 1200 by 630 PNG with the glass inside the center square', async () => {
    const saved = await finish('quiet', 'QuietHerder', 275.9);
    const id = saved.submissionId!;
    const sig = await signCardId(id, SECRET);
    useRasterWasm(readFileSync(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
    const font = new Uint8Array(readFileSync(new URL('../../app/public/fonts/piazzolla-card.ttf', import.meta.url)));
    const plate = new Uint8Array(readFileSync(new URL('../../app/public/cards/flank.jpg', import.meta.url)));
    const assets = async (input: Request | URL) => {
      const path = input instanceof URL ? input.pathname : new URL(input.url).pathname;
      if (path.endsWith('.ttf')) return new Response(font);
      if (path.endsWith('.jpg')) return new Response(plate);
      return new Response(null, { status: 404 });
    };
    const response = await worker.fetch(new Request(`https://cards.test/c/${id}.${sig}.png`), env(assets), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
    const drawn = await renderCardPng({
      name: 'QuietHerder',
      sheepCount: 25,
      scoreSeconds: 275.9,
      allTimeRank: 349,
      allTimePlayers: 698,
      weekRank: 9,
      weekPlayers: 27,
      weekLabel: 'week of 19 Oct',
    }, plate, font, 'right');
    expect(drawn.panel.x).toBeGreaterThanOrEqual(SAFE_LEFT);
    expect(drawn.panel.x + drawn.panel.width).toBeLessThanOrEqual(SAFE_RIGHT);
    expect(drawn.panel.y).toBeGreaterThanOrEqual(0);
    expect(drawn.panel.y + drawn.panel.height).toBeLessThanOrEqual(630);
  });
});
