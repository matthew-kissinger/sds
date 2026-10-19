// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// GET /c/<id>.<sig> is the page. GET /c/<id>.<sig>.png is the picture.
// The signature is checked before the row is read. A bad signature, an
// unknown id, a flagged row and a row that is not a version 3 flock time
// are the same 404.

import { factsForRun, readCardRun } from './cardQuery';
import { plateForId, renderCardPng } from './cardImage';
import { CARD_HTML_HEADERS, cardHtml, missingCardHtml } from './cardPage';
import { cardSignatureMatches, parseCardPath } from './cardToken';
import { log, errStr } from './log';

interface CardEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  JWT_SECRET: string;
}

const assetBytes = new Map<string, Promise<Uint8Array | null>>();

function loadAsset(env: CardEnv, origin: string, path: string): Promise<Uint8Array | null> {
  const cached = assetBytes.get(path);
  if (cached) return cached;
  const pending = env.ASSETS.fetch(new URL(path, origin)).then(async (response) => {
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }).catch(() => null);
  assetBytes.set(path, pending);
  // A miss is not kept. The next request can try the asset again.
  void pending.then((bytes) => {
    if (!bytes) assetBytes.delete(path);
  });
  return pending;
}

function htmlResponse(html: string, status: number, head: boolean): Response {
  return new Response(head ? null : html, { status, headers: CARD_HTML_HEADERS });
}

export async function handleCard(request: Request, env: CardEnv, head: boolean): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseCardPath(url.pathname);
  if (!parsed || !(await cardSignatureMatches(parsed.id, parsed.sig, env.JWT_SECRET))) {
    return htmlResponse(missingCardHtml(url.origin), 404, head);
  }
  try {
    const run = await readCardRun(env.DB, parsed.id);
    const facts = run ? await factsForRun(env.DB, run) : null;
    if (!facts) return htmlResponse(missingCardHtml(url.origin), 404, head);
    const pageUrl = `${url.origin}/c/${parsed.id}.${parsed.sig}`;
    const imageUrl = `${pageUrl}.png`;
    if (!parsed.png) return htmlResponse(cardHtml(facts, pageUrl, imageUrl), 200, head);
    const plate = plateForId(parsed.id);
    const [plateBytes, fontBytes] = await Promise.all([
      loadAsset(env, url.origin, plate.file),
      loadAsset(env, url.origin, '/fonts/piazzolla-card.ttf'),
    ]);
    if (!plateBytes || !fontBytes) {
      log.error('card_asset_missing', { plate: plate.file });
      return new Response(null, { status: 500, headers: { 'cache-control': 'no-store' } });
    }
    if (head) {
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=600',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    const rendered = await renderCardPng(facts, plateBytes, fontBytes, plate.side);
    return new Response(head ? null : rendered.png, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=600',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    log.error('card_failed', { error: errStr(error) });
    return new Response(null, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
