// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Drives the built game in every language, through its normal path (spec/15).
 *
 *   node tools/i18n-probe.mjs layout    [--locales id,ko] [--long] [--out dir]
 *   node tools/i18n-probe.mjs screens   [--locales id,ko] [--out dir]
 *   node tools/i18n-probe.mjs selection
 *   node tools/i18n-probe.mjs cost      --base <built dir of the earlier commit>
 *
 * `layout` opens each screen at phone and desktop sizes and reports any text that
 * leaves its control or the viewport, including the language offer against the Play
 * button, and text a closed select or a placeholder cannot show whole. `--long`
 * rewrites the German dictionary as it is served, so every word is 40% longer,
 * standing in for a language longer than any shipped. `screens` does the same for what
 * a player only reaches later: the finish panel, a room, its results and the history,
 * from a stubbed room service, and the finish panel from the dev server because the
 * production build publishes no store. `selection` checks
 * that `/` is English until a player chooses, whatever the browser says, and that
 * nothing redirects. `cost` compares what an English player downloads against an
 * earlier build.
 *
 * Layout and composition only. Phone emulation shares this machine's GPU and is
 * not a phone (AGENTS.md, measurement lanes), so nothing here is a timing or a
 * claim about a real device. Exits non-zero when a check fails.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { encode } from '@msgpack/msgpack';
import {
  launchBrowser, removeDir, repo, scratchDir, startPreviewServer, startServer, stopServer, stubHarnessNetwork,
} from './probe-lib.mjs';
import { builtClientDir } from '../scripts/build-output.mjs';

const [command = 'layout', ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const port = Number(option('port', '5391'));
const out = option('out', join(repo, 'captures/i18n'));
const LOCALES = JSON.parse(readFileSync(join(repo, 'app/src/i18n/locales.json'), 'utf8'));
const dictionary = (code) => JSON.parse(readFileSync(join(repo, `app/src/i18n/locales/${code}.json`), 'utf8'));
const BOOT_QUERY = '?seed=20260821&debug=webgl';

const PHONES = [
  { name: 'phone-320x568', width: 320, height: 568 },
  { name: 'phone-360x560', width: 360, height: 560 },
  { name: 'phone-360x640', width: 360, height: 640 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-landscape-844x390', width: 844, height: 390 },
];

/**
 * Sizes where only the title screen changes. Between the tall and the short phones a
 * card can be too tall with nothing to scroll it, which is how the links came to be cut
 * off on 360 by 800 Android phones once a browser bar takes its share.
 */
const TITLE_SIZES = [
  ...[641, 660, 680, 700, 720, 760, 800, 843].map((height) => ({ name: `phone-360x${height}`, width: 360, height })),
  { name: 'phone-320x641', width: 320, height: 641 },
  { name: 'phone-412x732', width: 412, height: 732 },
  { name: 'phone-landscape-667x375', width: 667, height: 375 },
  { name: 'tablet-landscape-1024x600', width: 1024, height: 600 },
  { name: 'desktop-short-1280x560', width: 1280, height: 560 },
];
const DESKTOP = { name: 'desktop-1280x800', width: 1280, height: 800 };

/** Text outside its control or off the side of the screen. Runs in the page. */
function auditScreen(rootSelector) {
  const found = [];
  const root = document.querySelector(rootSelector);
  if (!root) return [{ problem: 'screen-missing', selector: rootSelector }];
  const scrollsSideways = (node) => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollWidth > parent.clientWidth) return true;
    }
    return false;
  };
  // A closed select and a placeholder have no element to measure, so ask their type.
  const ink = document.createElement('canvas').getContext('2d');
  const inkWidth = (text, style) => {
    ink.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ink.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
    return ink.measureText(style.textTransform === 'uppercase' ? text.toUpperCase() : text).width;
  };
  const roomIn = (node, style) => node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  for (const node of root.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || node.closest('[hidden]') || node.closest('svg')) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const ownText = [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim() !== '');
    const control = node.matches('button, a, input, select');
    if (!ownText && !control) continue;
    const name = (node.textContent || node.getAttribute('placeholder') || '').trim().slice(0, 50);
    const where = `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`;
    if (!scrollsSideways(node) && (box.left < -1 || box.right > innerWidth + 1)) {
      found.push({ problem: 'off-screen', where, text: name, left: Math.round(box.left), right: Math.round(box.right) });
    }
    if (node.matches('select')) {
      // Every option, since any of them can be the one the closed control shows.
      const room = roomIn(node, style) - (style.appearance === 'none' ? 0 : 20);
      for (const option of node.options) {
        const width = inkWidth(option.text.trim(), style);
        if (width > room + 1) found.push({ problem: 'select-text-clipped', where, text: option.text.trim().slice(0, 50), textWidth: Math.round(width), room: Math.round(room) });
      }
    }
    if (node.matches('input') && node.placeholder && node.value === '') {
      const room = roomIn(node, style);
      const width = inkWidth(node.placeholder, getComputedStyle(node, '::placeholder'));
      if (width > room + 1) found.push({ problem: 'placeholder-clipped', where, text: node.placeholder.slice(0, 50), textWidth: Math.round(width), room: Math.round(room) });
    }
    if (ownText) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const ellipsis = style.textOverflow === 'ellipsis';
      if (ellipsis && node.scrollWidth > node.clientWidth + 1) {
        found.push({ problem: 'text-ellipsised', where, text: name, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
      }
      const clipsX = style.overflowX !== 'visible';
      if (!ellipsis && !clipsX && (text.left < box.left - 1 || text.right > box.right + 1)) {
        found.push({ problem: 'text-outside-control', where, text: name, textWidth: Math.round(text.width), boxWidth: Math.round(box.width) });
      }
      if (!ellipsis && clipsX && node.scrollWidth > node.clientWidth + 1 && !node.matches('input, select')) {
        found.push({ problem: 'text-clipped', where, text: name, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
      }
      // By its edges, not its height: a control held short can be taller than its text and still have the text run through its border.
      if (control && (text.top < box.top - 1 || text.bottom > box.bottom + 1)) {
        found.push({ problem: 'text-past-control-edge', where, text: name, textTop: Math.round(text.top), textBottom: Math.round(text.bottom), boxTop: Math.round(box.top), boxBottom: Math.round(box.bottom) });
      }
      if (/^[\d\s.,:/]+$/.test(name) && new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) {
        found.push({ problem: 'number-split', where, text: name });
      }
    }
    if (node.matches('button, .herd-title-links a') && box.height < 24) {
      found.push({ problem: 'small-target', where, text: name, height: Math.round(box.height) });
    }
  }
  return found;
}

/** Audit one screen and keep its picture, and its far end when it scrolls. */
function screenChecker(report, tag = '') {
  return async (page, code, viewport, screen, selector) => {
    await page.waitForTimeout(250);
    const label = `${code}${tag}-${viewport}-${screen}`;
    const findings = await page.evaluate(auditScreen, selector);
    report.screens += 1;
    for (const finding of findings) report.findings.push({ locale: code, viewport, screen, ...finding });
    await page.screenshot({ path: join(out, `${label}.png`) });
    const scrolled = await page.evaluate((rootSelector) => {
      const root = document.querySelector(rootSelector);
      if (!root) return false;
      const scroller = [root, ...root.querySelectorAll('*')].find((node) => node.scrollHeight > node.clientHeight + 40
        && /auto|scroll/.test(getComputedStyle(node).overflowY));
      if (!scroller) return false;
      scroller.scrollTop = scroller.scrollHeight;
      return true;
    }, selector);
    if (!scrolled) return;
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(out, `${label}-end.png`) });
    await page.evaluate((rootSelector) => {
      const root = document.querySelector(rootSelector);
      for (const node of [root, ...root.querySelectorAll('*')]) if (node.scrollTop > 0) node.scrollTop = 0;
    }, selector);
  };
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const app = document.querySelector('.herd-app');
    return app instanceof HTMLElement && app.dataset.ready === 'true';
  }, undefined, { timeout: 180_000, polling: 200 });
  await page.waitForSelector('.herd-title-card .herd-button--primary:not([disabled])', { timeout: 60_000 });
}

/** Stand-in for a language longer than any shipped: every word 40% longer. */
function lengthen(chunk) {
  // The minifier may write a string with either quote.
  const lengthened = chunk.replace(/:(["`])((?:[^"`\\]|\\.)*)\1/g, (_, quote, value) => {
    // Matching a placeholder whole keeps it from being lengthened, which would break it.
    const long = value.replace(/\{\w+\}|\p{L}{3,}/gu, (word) => (word.startsWith('{') ? word : `${word}${word.slice(0, Math.ceil(word.length * 0.4))}`));
    return `:${quote}${long}${quote}`;
  });
  // A rewrite that stops matching would otherwise pass every check on ordinary German.
  if (lengthened.length < chunk.length * 1.1) throw new Error('--long did not lengthen the dictionary');
  return lengthened;
}

async function layout() {
  const codes = option('locales', LOCALES.map((locale) => locale.code).join(',')).split(',');
  const long = args.includes('--long');
  mkdirSync(out, { recursive: true });
  const server = await startPreviewServer(port);
  const profile = scratchDir('i18n-probe');
  const browser = await launchBrowser(profile);
  const report = { limitation: 'Layout under phone emulation on a desktop machine. Not a phone.', long, screens: 0, findings: [], consoleErrors: [] };
  const check = screenChecker(report, long ? '-long' : '');

  /** Every control on the title can be reached, at a finger's reach, and scrolling it moves nothing that fits. */
  const checkTitle = async (page, cdp, code, viewport, screen) => {
    const find = (finding) => report.findings.push({ locale: code, viewport: viewport.name, screen, ...finding });
    const facts = await page.evaluate(() => {
      const card = document.querySelector('.herd-title-card');
      const play = () => document.querySelector('.herd-title-actions .herd-button--primary').getBoundingClientRect();
      const playBottom = play().bottom;
      const unreachable = [];
      for (const node of card.querySelectorAll('button, a, select')) {
        node.scrollIntoView({ block: 'nearest' });
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (box.top < -0.5 || box.bottom > innerHeight + 0.5 || !hit || !(node === hit || node.contains(hit) || hit.contains(node))) {
          unreachable.push({ text: node.textContent.trim().slice(0, 30), top: Math.round(box.top), bottom: Math.round(box.bottom) });
        }
      }
      card.scrollTo(0, 0);
      const overflow = card.scrollHeight - card.clientHeight;
      let moved = 0;
      if (overflow <= 0) {
        // What the fallback costs a card that fits: take it away and see if Play moves.
        const before = play().top;
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '.herd-boot .herd-title-card { max-height: none; overflow: visible; padding: 0; }';
        moved = play().top - before;
        style.remove();
      }
      const box = card.getBoundingClientRect();
      return { playBottom, height: innerHeight, unreachable, overflow, moved, centre: { x: box.left + box.width / 2, y: box.top + box.height / 2 } };
    });
    for (const control of facts.unreachable) find({ problem: 'control-unreachable', ...control });
    if (facts.playBottom > facts.height) find({ problem: 'play-below-the-fold', playBottom: Math.round(facts.playBottom), height: facts.height });
    if (Math.abs(facts.moved) > 1) find({ problem: 'fallback-moved-play', moved: facts.moved });
    if (facts.overflow > 0 && cdp) {
      // Touch events, because a synthesized scroll gesture does not move the card even
      // when a finger does.
      const { x, y } = facts.centre;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let step = 1; step <= 12; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 10, id: 1 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
      const scrolled = await page.evaluate(() => document.querySelector('.herd-title-card').scrollTop);
      if (scrolled <= 0) find({ problem: 'card-will-not-scroll-by-touch', overflow: facts.overflow });
      await page.evaluate(() => document.querySelector('.herd-title-card').scrollTo(0, 0));
    }
  };

  const visitTitleSizes = async (code) => {
    const context = await browser.newContext({ viewport: TITLE_SIZES[0], hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'en-US' });
    await stubHarnessNetwork(context);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}&lang=${code}`);
    await waitReady(page);
    for (const viewport of [...PHONES, ...TITLE_SIZES]) {
      await page.setViewportSize(viewport);
      if (TITLE_SIZES.includes(viewport)) await check(page, code, viewport.name, 'title', '.herd-title-card');
      else await page.waitForTimeout(250);
      await checkTitle(page, cdp, code, viewport, 'title');
    }
    await context.close();
  };

  const visit = async (code, viewports, touch) => {
    const context = await browser.newContext({
      viewport: viewports[0], hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, locale: 'en-US',
    });
    await stubHarnessNetwork(context);
    if (long) {
      await context.route(/\/assets\/de-[\w-]+\.js$/, async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: lengthen(await response.text()) });
      });
    }
    const page = await context.newPage();
    page.on('pageerror', (error) => report.consoleErrors.push({ locale: code, message: error.message }));
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}&lang=${code}`);
    await waitReady(page);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const name = viewport.name;
      await check(page, code, name, 'title', '.herd-title-card');
      if (code !== 'en') await page.locator('.herd-language-picker select').selectOption(code);

      const tools = page.locator('.herd-title-tools button');
      await tools.nth(1).click();
      await check(page, code, name, 'settings', '.herd-panel');
      await page.locator('.herd-panel__header .herd-icon-button').click();

      await page.locator('.herd-title-tools button').nth(2).click();
      await check(page, code, name, 'times', '.herd-board-panel');
      await page.locator('.herd-board-tabs').first().locator('button').last().click();
      await check(page, code, name, 'times-mine', '.herd-board-panel');
      await page.locator('.herd-board-panel .herd-icon-button').click();

      await page.locator('.herd-title-tools button').nth(0).click();
      await page.waitForSelector('.herd-customize-dock');
      for (const [index, tab] of ['studio-dog', 'studio-flock', 'studio-sheep'].entries()) {
        await page.locator('.herd-tabs button').nth(index).click();
        await check(page, code, name, tab, '.herd-studio');
      }
      await page.locator('[data-studio-close]').click();

      await page.locator('.herd-title-actions button').nth(1).click();
      await page.waitForSelector('.mp-dialog[open]');
      await check(page, code, name, 'multiplayer', '.mp-dialog');
      await page.locator('.mp-foot button').first().click();
      await page.waitForSelector('.mp-dialog[open]', { state: 'detached' }).catch(() => undefined);
    }
    // Play last: it leaves the title, and the sizes below reuse the running HUD.
    await page.locator('.herd-title-actions .herd-button--primary').click();
    await page.waitForFunction(() => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing', undefined, { timeout: 60_000 });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await check(page, code, viewport.name, 'hud', '.herd-app');
      if (touch) {
        const fits = await page.evaluate(() => [...document.querySelectorAll('.herd-sprint-button, .herd-bark-button, .herd-camera-button')].map((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return { text: button.textContent, textWidth: Math.round(text.width), width: Math.round(box.width), lines: Math.round(text.height / parseFloat(getComputedStyle(button).lineHeight) || 1) };
        }));
        for (const button of fits) {
          if (button.textWidth > button.width - 4) report.findings.push({ locale: code, viewport: viewport.name, screen: 'touch', problem: 'touch-label-too-wide', ...button });
        }
      }
    }
    await page.locator('.herd-pause-button').click();
    await check(page, code, viewports[0].name, 'pause', '.herd-panel');
    await context.close();
  };

  /** A first visit from a browser in this language: the offer, in English surroundings. */
  const visitOffer = async (code) => {
    const context = await browser.newContext({ viewport: PHONES[0], hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: code });
    await stubHarnessNetwork(context);
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}`);
    await waitReady(page);
    await page.waitForSelector('.herd-language-offer', { timeout: 30_000 });
    const cdp = await context.newCDPSession(page);
    for (const viewport of [...PHONES, ...TITLE_SIZES]) {
      await page.setViewportSize(viewport);
      await check(page, code, viewport.name, 'title-offer', '.herd-title-card');
      await checkTitle(page, cdp, code, viewport, 'title-offer');
      const boxes = await page.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
        };
        return { play: rect('.herd-title-actions .herd-button--primary'), offer: rect('.herd-language-offer'), height: innerHeight };
      });
      const overlaps = boxes.offer.top < boxes.play.bottom && boxes.offer.bottom > boxes.play.top
        && boxes.offer.left < boxes.play.right && boxes.offer.right > boxes.play.left;
      if (overlaps) report.findings.push({ locale: code, viewport: viewport.name, screen: 'title-offer', problem: 'offer-over-play' });
    }
    await context.close();
  };

  try {
    for (const code of codes) {
      await visit(code, PHONES, true);
      await visitTitleSizes(code);
      await visit(code, [DESKTOP], false);
      if (code !== 'en') await visitOffer(code);
      console.log(`${code}: done, ${report.findings.filter((finding) => finding.locale === code).length} findings`);
    }
  } finally {
    await browser.close();
    stopServer(server);
    removeDir(profile);
  }
  writeFileSync(join(out, `layout${long ? '-long' : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ screens: report.screens, findings: report.findings.length, consoleErrors: report.consoleErrors.length }));
  const summary = new Map();
  for (const finding of report.findings) {
    const key = `${finding.problem} ${finding.where ?? ''} "${finding.text ?? ''}" [${finding.locale}]`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  for (const [key, count] of summary) console.log(`${count}x ${key}`);
  return report.findings.length + report.consoleErrors.length === 0;
}

const PROTOCOL = Number(readFileSync(join(repo, 'net/messages.ts'), 'utf8').match(/PROTOCOL = (\d+)/)[1]);
const ROOM_HANDLE = `apac_${'a'.repeat(32)}`;
const NAMES = ['Mossy Lamb', 'Quiet Drover', 'Bracken Hill'];
const SCREEN_SIZES = [PHONES[0], PHONES[2], PHONES[4]];

const standings = (counts, forfeited = []) => counts.map((count, slot) => ({ slot, name: NAMES[slot], count, forfeited: forfeited.includes(slot) }));
const roomResult = (fields) => ({ mode: 'competitive', reason: 'flock', tick: 5004, count: 75, started: 3, remaining: 2, standings: standings([41, 34, 0], [2]), unclaimed: 0, winners: [0], ...fields });
const roomView = (revision, fields) => ({
  type: 'room', protocol: PROTOCOL, handle: ROOM_HANDLE, region: 'apac', revision,
  settings: { mode: fields.mode ?? 'coop', flockSize: 75, visibility: fields.visibility ?? 'private' },
  phase: fields.phase ?? 'waiting', round: fields.round ?? null, interruption: fields.interruption ?? null, hostSlot: fields.hostSlot ?? 0,
  members: [
    { slot: 0, name: NAMES[0], connected: true, ready: true },
    { slot: 1, name: NAMES[1], connected: true, ready: false },
    { slot: 2, name: NAMES[2], connected: false, ready: false },
  ],
  result: fields.result ?? null,
});

/** Every room a player can be shown, in the order a round goes. */
const ROOM_SCREENS = [
  ['mp-lobby-host', {}],
  ['mp-lobby-competitive', { mode: 'competitive', visibility: 'public' }],
  ['mp-lobby-guest', { hostSlot: 1 }],
  ['mp-starting', { phase: 'starting', round: 'probe' }],
  ['mp-interrupted', { interruption: 'server_restart' }],
  ['mp-result-coop', { phase: 'finished', result: roomResult({ mode: 'coop', standings: [], winners: [] }) }],
  ['mp-result-winner', { phase: 'finished', mode: 'competitive', result: roomResult({}) }],
  ['mp-result-shared', { phase: 'finished', mode: 'competitive', result: roomResult({ winners: [0, 1], standings: standings([30, 30, 12], [2]), unclaimed: 3 }) }],
  ['mp-result-forfeit', { phase: 'finished', mode: 'competitive', result: roomResult({ reason: 'forfeit' }) }],
  ['mp-result-none', { phase: 'finished', mode: 'competitive', hostSlot: 1, result: roomResult({ reason: 'no_winner', winners: [] }) }],
];

const historyPlayer = (slot, fields) => ({ slot, name: NAMES[slot], count: null, forfeited: false, outcome: 'none', disconnects: 0, reconnects: 0, ...fields });
const historyMatch = (id, fields) => ({
  id, region: 'apac', mode: 'competitive', flockSize: 75, visibility: 'private', rules: 'competitive-1', partySize: 3, yourSlot: 0,
  createdAt: Date.UTC(2026, 10, 3, 18, 4), startedAt: null, endedAt: null, status: 'finished', reason: 'flock', ticks: 5004, count: 75, unclaimed: 0, waitMs: 2000,
  players: [historyPlayer(0, { count: 41, outcome: 'win' }), historyPlayer(1, { count: 34 }), historyPlayer(2, { count: 0, forfeited: true })],
  ...fields,
});
const HISTORY = {
  stats: [
    { mode: 'coop', matches: 12, completed: 9, wins: 0, sharedWins: 0, forfeitWins: 0, forfeits: 1, sheep: 600, interruptions: 1 },
    { mode: 'competitive', matches: 8, completed: 0, wins: 3, sharedWins: 1, forfeitWins: 1, forfeits: 1, sheep: 140, interruptions: 1 },
  ],
  matches: [
    historyMatch('win', {}),
    historyMatch('forfeit', { reason: 'forfeit', visibility: 'public', unclaimed: 7, players: [historyPlayer(0, { count: 34, outcome: 'forfeit_win' }), historyPlayer(1, { count: 34, forfeited: true })] }),
    historyMatch('shared', { players: [historyPlayer(0, { count: 34, outcome: 'shared' }), historyPlayer(1, { count: 34, outcome: 'shared' })] }),
    historyMatch('coop', { mode: 'coop', rules: 'coop-1', players: [historyPlayer(0, { outcome: 'coop_complete' }), historyPlayer(1, { outcome: 'coop_complete', forfeited: true })] }),
    historyMatch('interrupted', { status: 'interrupted', reason: 'server_restart', ticks: null, count: null }),
    historyMatch('abandoned', { status: 'abandoned', reason: null, ticks: null, count: null }),
    historyMatch('starting', { status: 'starting', reason: null, ticks: null, count: null }),
    historyMatch('playing', { status: 'playing', reason: null, ticks: null, count: null }),
  ],
  next: 'older',
};

const boardEntries = [1, 2, 3, 4, 5].map((rank) => ({ rank, persistent_id: `probe-${rank}`, displayName: NAMES[rank % 3], fullName: NAMES[rank % 3], score: 96.4 + rank * 7 }));
const ownRun = (sheepCount, score, boardRank, fields = {}) => ({
  sheepCount, score, submittedAt: Date.UTC(2026, 10, 3) - boardRank * 86_400_000, boardRank, boardPlayers: 1204,
  weekRank: Math.min(boardRank, 340), weekPlayers: 340, weekLabel: 'week of 2 November', sharePath: `/c/probe${boardRank}`, ...fields,
});
const OWN_RUNS = [ownRun(25, 96.4, 1), ownRun(25, 108.2, 12), ownRun(25, 131.7, 100), ownRun(75, 186.3, 48)];

/** Answers for a room service, a leaderboard and a history. Nothing leaves the machine. */
async function stubRooms(context, sockets) {
  await stubHarnessNetwork(context, { displayName: NAMES[0] });
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('**/api/leaderboard*', (route) => json(route, { entries: boardEntries, week: '2026-W45', weekLabel: 'week of 2 November' }));
  await context.route('**/api/my-scores*', (route) => json(route, { entries: OWN_RUNS }));
  await context.route('**/r/rooms', (route) => json(route, { handle: ROOM_HANDLE, slot: 0, ticket: 'probe' }));
  await context.route('**/r/lobbies/*', (route) => json(route, { rooms: [roomView(1, { mode: 'competitive', visibility: 'public' })] }));
  await context.route('**/r/stats/me*', (route) => json(route, HISTORY));
  await context.routeWebSocket(/\/r\/[^/]+\/ws/, (socket) => {
    sockets.push(socket);
    // The client closes a socket that has gone quiet for five seconds.
    socket.onMessage(() => socket.send(Buffer.from(encode({ type: 'pong', protocol: PROTOCOL }))));
  });
}

/** How a finish panel ends up, given what the score service said. Runs in the dev page. */
async function finishRun(variant) {
  const { useGameStore } = await import('/src/state/store.ts');
  const { useScoreStore } = await import('/src/scores/store.ts');
  const { translate } = await import('/src/i18n/store.ts');
  const patch = useScoreStore.getState().patch;
  if (variant === 'start') {
    useGameStore.setState({ gamePhase: 'playing', uiPanel: 'none', flockSize: 75 });
    useGameStore.setState({
      gamePhase: 'complete', uiPanel: 'none', flockSize: 75, completionTimeMs: 186266, completionTick: 11176,
      personalBests: { 25: null, 75: 186266, 200: null }, lastRunWasBest: true,
    });
    return;
  }
  const none = { sharePath: null, resultWeekRank: null, resultWeekPlayers: null, resultBoardRank: null, resultBoardPlayers: null };
  if (variant === 'ranks') {
    patch({ sharePath: '/c/probe', shareTitle: 'probe', shareText: 'probe', resultWeekRank: 12, resultWeekPlayers: 340, resultBoardRank: 48, resultBoardPlayers: 1204 });
  } else if (variant === 'online') {
    const entries = [1, 2, 3, 4, 5].map((rank) => ({ rank, persistentId: `probe-${rank}`, displayName: 'Mossy Lamb', fullName: 'Mossy Lamb', scoreSeconds: 96.4 + rank * 7 }));
    patch({ ...none, submissionStatus: 'ready', entries, rank: 12, submissionMessage: translate('scores.rank', { rank: 12 }) });
  } else if (variant === 'outside') {
    useGameStore.setState({ lastRunWasBest: false, personalBests: { 25: null, 75: 171400, 200: null } });
    patch({ ...none, submissionStatus: 'ready', entries: [], rank: null, submissionMessage: translate('scores.outsideTop') });
  } else {
    useGameStore.setState({ lastRunWasBest: true, personalBests: { 25: null, 75: 186266, 200: null } });
    patch({ ...none, submissionStatus: 'offline', entries: [], rank: null, submissionMessage: translate('scores.localSafe') });
  }
}

async function screens() {
  const codes = option('locales', LOCALES.map((locale) => locale.code).join(',')).split(',');
  mkdirSync(out, { recursive: true });
  const report = { limitation: 'Layout from stubbed services under phone emulation on a desktop machine. Not a phone, and not a real room.', screens: 0, findings: [], consoleErrors: [] };
  const check = screenChecker(report);
  const profile = scratchDir('i18n-screens');
  const browser = await launchBrowser(profile);
  const server = await startPreviewServer(port);
  const dev = await startServer(port + 2);

  /** The production build: leaderboards with rows in them, then a room from start to finish. */
  const visitRooms = async (code, viewports, touch) => {
    const context = await browser.newContext({ viewport: viewports[0], hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, locale: 'en-US' });
    const sockets = [];
    await stubRooms(context, sockets);
    const page = await context.newPage();
    page.on('pageerror', (error) => report.consoleErrors.push({ locale: code, message: error.message }));
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}&lang=${code}`);
    await waitReady(page);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.locator('.herd-title-tools button').nth(2).click();
      await page.waitForSelector('.herd-board-panel ol, .herd-board-panel table');
      await check(page, code, viewport.name, 'times-rows', '.herd-board-panel');
      await page.locator('.herd-board-tabs').nth(1).locator('button').last().click();
      await check(page, code, viewport.name, 'times-week', '.herd-board-panel');
      await page.locator('.herd-board-tabs').first().locator('button').last().click();
      await page.waitForSelector('.herd-mine-runs');
      await check(page, code, viewport.name, 'times-mine-runs', '.herd-board-panel');
      await page.locator('.herd-board-panel .herd-icon-button').click();
    }
    await page.locator('.herd-title-actions button').nth(1).click();
    await page.waitForSelector('.mp-dialog[open] .mp-rooms');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await check(page, code, viewport.name, 'mp-board', '.mp-dialog');
    }
    await page.locator('.mp-foot .mp-btn--primary').click();
    await page.waitForFunction(() => location.pathname.startsWith('/r/'));
    while (sockets.length === 0) await page.waitForTimeout(50);
    const socket = sockets[0];
    let revision = 1;
    const show = async (fields) => {
      revision += 1;
      socket.send(Buffer.from(encode(roomView(revision, fields))));
      await page.waitForTimeout(150);
    };
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const [name, fields] of ROOM_SCREENS) {
        await show(fields);
        await check(page, code, viewport.name, name, '.mp-dialog');
      }
      // The last room above has a result, and so a way to the history.
      await page.locator('.mp-body > .mp-btn--quiet').click();
      await page.waitForSelector('.history-matches');
      await check(page, code, viewport.name, 'mp-history', '.mp-dialog');
      await page.locator('.mp-row .mp-btn--small').first().click();
      await show({ phase: 'playing', mode: 'competitive', round: 'probe' });
      await check(page, code, viewport.name, 'mp-hud', '.mp-hud');
    }
    await context.close();
  };

  /** The dev server, because a finish takes a whole round in the production build. */
  const visitFinish = async () => {
    const context = await browser.newContext({ viewport: PHONES[0], hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'en-US' });
    await stubHarnessNetwork(context, { displayName: NAMES[0] });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.consoleErrors.push({ locale: 'dev', message: error.message }));
    await page.goto(`http://localhost:${port + 2}/${BOOT_QUERY}`);
    await waitReady(page);
    for (const code of codes) {
      await page.evaluate(async (locale) => {
        const { chooseLocale } = await import('/src/i18n/store.ts');
        await chooseLocale(locale);
      }, code);
      await page.evaluate(finishRun, 'start');
      await page.waitForSelector('[data-testid="completion"]');
      // Let the stubbed score answer land, so it cannot overwrite the states below.
      await page.waitForTimeout(600);
      for (const viewport of [...SCREEN_SIZES, DESKTOP]) {
        await page.setViewportSize(viewport);
        for (const variant of ['ranks', 'online', 'outside', 'offline']) {
          await page.evaluate(finishRun, variant);
          await check(page, code, viewport.name, `done-${variant}`, '[data-testid="completion"]');
        }
      }
      await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/store.ts');
        useGameStore.getState().reset();
        useGameStore.setState({ sceneReady: false });
      });
      for (const viewport of SCREEN_SIZES) {
        await page.setViewportSize(viewport);
        await check(page, code, viewport.name, 'boot-loading', '.herd-title-card');
      }
      await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/store.ts');
        useGameStore.setState({ graphicsLost: true });
      });
      for (const viewport of SCREEN_SIZES) {
        await page.setViewportSize(viewport);
        await check(page, code, viewport.name, 'graphics-lost', '[role="alertdialog"]');
      }
      await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/store.ts');
        useGameStore.setState({ graphicsLost: false, sceneReady: true });
      });
      console.log(`${code}: finish panel done`);
    }
    await context.close();
  };

  try {
    for (const code of codes) {
      await visitRooms(code, SCREEN_SIZES, true);
      await visitRooms(code, [DESKTOP], false);
      console.log(`${code}: rooms done, ${report.findings.filter((finding) => finding.locale === code).length} findings`);
    }
    await visitFinish();
  } finally {
    await browser.close();
    stopServer(server);
    stopServer(dev);
    removeDir(profile);
  }
  writeFileSync(join(out, 'screens.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ screens: report.screens, findings: report.findings.length, consoleErrors: report.consoleErrors.length }));
  const summary = new Map();
  for (const finding of report.findings) {
    const key = `${finding.problem} ${finding.where ?? ''} "${finding.text ?? ''}" [${finding.locale}] ${finding.screen}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  for (const [key, count] of summary) console.log(`${count}x ${key}`);
  return report.findings.length + report.consoleErrors.length === 0;
}

/**
 * What reaches a server when a page closes mid-run. Playwright's interception does
 * not see a request from a page going away, so this has a real server and no routes.
 */
async function eventsFromClosedPage(browser) {
  const arrived = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/api/event') {
      let body = '';
      for await (const chunk of request) body += chunk;
      arrived.push(JSON.parse(body));
    }
    if (path.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe' } }));
      return;
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(path)];
    try {
      const file = await readFile(join(builtClientDir, path === '/' ? 'index.html' : path));
      response.writeHead(200, type ? { 'content-type': type } : {}).end(file);
    } catch {
      response.writeHead(404).end();
    }
  });
  const serverPort = port + 1;
  await new Promise((resolve) => { server.listen(serverPort, resolve); });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  try {
    const page = await context.newPage();
    await page.goto(`http://localhost:${serverPort}/${BOOT_QUERY}`);
    await waitReady(page);
    await page.locator('.herd-title-actions .herd-button--primary').click();
    await page.waitForFunction(() => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing', undefined, { timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.close();
    await new Promise((resolve) => { setTimeout(resolve, 2_000); });
  } finally {
    await context.close();
    server.close();
  }
  return arrived;
}

async function selection() {
  const server = await startPreviewServer(port);
  const profile = scratchDir('i18n-probe');
  const browser = await launchBrowser(profile);
  const results = [];
  const claim = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  };
  const open = async (query = '', { browserLanguage = 'en-US', saved, routes } = {}) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: browserLanguage });
    await stubHarnessNetwork(context);
    if (saved) await context.addInitScript((value) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sheepdog.language.v1', value); sessionStorage.setItem('seeded', '1'); } }, saved);
    if (routes) await routes(context);
    const page = await context.newPage();
    const requests = [];
    const documents = [];
    const events = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      requests.push(new URL(request.url()).pathname);
      if (request.isNavigationRequest()) documents.push(new URL(request.url()).pathname);
      if (new URL(request.url()).pathname === '/api/event') events.push(request.postDataJSON());
    });
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}${query}`);
    await waitReady(page);
    return { context, page, requests, documents, events, pageErrors };
  };
  /** Holds a language's chunk back until `release` is called. */
  const holdChunk = (code) => {
    let release;
    const released = new Promise((resolve) => { release = resolve; });
    const routes = (target) => target.route(new RegExp(`/assets/${code}-[\\w-]+\\.js$`), async (route) => {
      await released;
      await route.continue();
    });
    return { routes, release };
  };
  const shows = (page) => page.locator('.herd-title-actions .herd-button--primary').innerText();
  const facts = (page) => page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    path: location.pathname,
    search: location.search,
    canonical: document.querySelector('link[rel=canonical]')?.href,
    saved: localStorage.getItem('sheepdog.language.v1'),
  }));
  const EN_TITLE = 'Sheepdog Sim - Free Sheep Herding Browser Game';
  const dictionaryRequest = /\/assets\/(id|ms|ko|ja|zh-CN|es|pt-BR|fr|de|ru)-/;
  const settle = (page) => page.waitForTimeout(400);

  try {
    {
      const { context, page, requests, documents, events } = await open();
      await settle(page);
      const seen = await facts(page);
      claim('English browser at / shows English', await shows(page) === dictionary('en')['title.playSolo']);
      claim('English player fetches no dictionary', !requests.some((path) => dictionaryRequest.test(path)));
      claim('English player fetches no extra font', !requests.some((path) => /latin1|cyrillic/.test(path)));
      claim('and sees no offer', await page.locator('.herd-language-offer').count() === 0);
      claim('/ does not navigate anywhere', documents.length === 1 && documents[0] === '/');
      claim('the picker is on the title screen', await page.locator('.herd-language-picker select').isVisible());
      claim('nothing is saved by loading', seen.saved === null);
      claim('the load is counted, with no identity', events[0]?.name === 'funnel_load' && events[0].props.source === 'default' && !JSON.stringify(events).includes('harness'), JSON.stringify(events[0]));
      await context.close();
    }
    {
      const { context, page, requests, documents, events } = await open('', { browserLanguage: 'id-ID' });
      await page.waitForSelector('.herd-language-offer', { timeout: 30_000 });
      const seen = await facts(page);
      claim('Indonesian browser at / still shows English', await shows(page) === dictionary('en')['title.playSolo']);
      claim('and is not redirected', documents.length === 1 && seen.path === '/', documents.join(' '));
      claim('and html lang stays en', seen.lang === 'en', seen.lang);
      claim('and is offered Indonesian, in Indonesian', await page.locator('.herd-language-offer span').innerText() === dictionary('id')['offer.prompt']);
      claim('the offer does not save anything', seen.saved === null);
      claim('fetching the offer fetches only that dictionary', requests.filter((path) => dictionaryRequest.test(path)).every((path) => /assets\/id-/.test(path)));
      await page.locator('.herd-title-actions .herd-button--primary').click();
      await page.waitForFunction(() => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing', undefined, { timeout: 60_000 });
      claim('Play works with the offer ignored, and in English', (await page.locator('.herd-stamina__label').innerText()).toLowerCase() === dictionary('en')['hud.sprint'].toLowerCase());
      await settle(page);
      claim('offer and stages are counted', ['funnel_load', 'funnel_ready', 'language_offered', 'funnel_play'].every((name) => events.some((event) => event.name === name)), events.map((event) => event.name).join(' '));
      const named = (name) => events.filter((event) => event.name === name);
      const ready = named('funnel_ready')[0]?.props ?? {};
      claim('ready says how long, which renderer and which tier, coarsely', /^(<5s|5-10s|10-20s|20-40s|>40s)$/.test(ready.load) && ['webgpu', 'webgl2'].includes(ready.renderer) && ['high', 'medium', 'low'].includes(ready.tier), JSON.stringify(ready));
      claim('starting a round is not moving', named('funnel_moved').length === 0);
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowUp');
      await settle(page);
      claim('the first real push of a key is counted, once', named('funnel_moved').length === 1, events.map((event) => event.name).join(' '));
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await settle(page);
      const hidden = named('funnel_hidden');
      claim('hiding the page is counted once, mid-run', hidden.length === 1 && hidden[0].props.phase === 'playing' && hidden[0].props.sheep === 'none', JSON.stringify(hidden[0]?.props));
      await context.close();
    }
    {
      const arrived = await eventsFromClosedPage(browser);
      const left = arrived.filter((event) => event.name === 'funnel_left');
      claim('closing the page mid-run still reaches a real server, once', left.length === 1 && left[0].props.phase === 'playing', arrived.map((event) => event.name).join(' '));
      claim('with a coarse median frame', /^(<20ms|20-33ms|33-50ms|50-100ms|100-250ms|>250ms)$/.test(left[0]?.props.frame), left[0]?.props.frame);
      claim('and no identity', !JSON.stringify(left).includes('probe'), JSON.stringify(left[0]?.props));
    }
    {
      const { context, page, events } = await open('', { browserLanguage: 'id-ID' });
      await page.waitForSelector('.herd-language-offer', { timeout: 30_000 });
      await page.locator('.herd-language-offer button').nth(0).click();
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('id')['title.playSolo']);
      const seen = await facts(page);
      claim('accepting the offer switches without a reload and saves', seen.saved === 'id' && seen.lang === 'id' && seen.path === '/');
      claim('and the title stays English', seen.title === EN_TITLE);
      claim('and the offer leaves', await page.locator('.herd-language-offer').count() === 0);
      await settle(page);
      claim('and the choice is counted', events.some((event) => event.name === 'language_chosen' && event.props.via === 'offer' && event.props.to === 'id'));
      await page.reload();
      await waitReady(page);
      claim('a reload stays Indonesian', await shows(page) === dictionary('id')['title.playSolo']);
      await context.close();
    }
    {
      const { context, page, events } = await open('', { browserLanguage: 'id-ID' });
      await page.waitForSelector('.herd-language-offer', { timeout: 30_000 });
      await page.locator('.herd-language-offer button').nth(1).click();
      claim('declining the offer removes it', await page.locator('.herd-language-offer').count() === 0);
      claim('and stays English', await shows(page) === dictionary('en')['title.playSolo']);
      await settle(page);
      claim('and is counted', events.some((event) => event.name === 'language_declined'));
      await page.reload();
      await waitReady(page);
      await settle(page);
      claim('and is remembered', await page.locator('.herd-language-offer').count() === 0);
      await context.close();
    }
    {
      const { context, page, documents } = await open('&lang=id');
      const seen = await facts(page);
      claim('?lang=id shows Indonesian to an English browser', await shows(page) === dictionary('id')['title.playSolo']);
      claim('and saves it', seen.saved === 'id');
      claim('and leaves the address, keeping the documented parameters', seen.path === '/' && !seen.search.includes('lang') && seen.search.includes('seed=') && seen.search.includes('debug='), seen.search);
      claim('and stays the one page', seen.canonical === 'https://sheepdogsim.com/' && seen.title === EN_TITLE && documents.length === 1);
      await context.close();
    }
    {
      const { context, page } = await open('&lang=ko', { saved: 'id' });
      claim('?lang= beats a saved choice', await shows(page) === dictionary('ko')['title.playSolo']);
      claim('and replaces it', (await facts(page)).saved === 'ko');
      await context.close();
    }
    {
      const { context, page } = await open('', { saved: 'id', browserLanguage: 'ko-KR' });
      await settle(page);
      claim('a saved choice beats the browser and silences the offer', await shows(page) === dictionary('id')['title.playSolo'] && await page.locator('.herd-language-offer').count() === 0);
      await context.close();
    }
    {
      const { context, page, documents } = await open();
      await page.evaluate(() => { window.__notReloaded = true; });
      await page.locator('.herd-language-picker select').selectOption('ko');
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('ko')['title.playSolo']);
      const seen = await facts(page);
      claim('the title picker switches without a reload', await page.evaluate(() => window.__notReloaded === true) && documents.length === 1);
      claim('and saves, and keeps / and its title', seen.saved === 'ko' && seen.path === '/' && seen.title === EN_TITLE && seen.lang === 'ko');
      await page.reload();
      await waitReady(page);
      claim('and a reload stays Korean', await shows(page) === dictionary('ko')['title.playSolo']);
      await page.locator('.herd-language-picker select').selectOption('en');
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('en')['title.playSolo']);
      claim('and choosing English goes back and is remembered', (await facts(page)).saved === 'en');
      await context.close();
    }
    {
      const { context, page } = await open();
      await page.locator('.herd-title-actions .herd-button--primary').click();
      await page.waitForFunction(() => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing', undefined, { timeout: 60_000 });
      await page.waitForTimeout(500);
      await page.locator('.herd-pause-button').click();
      await page.locator('.herd-panel-actions button').nth(1).click();
      await page.locator('.herd-settings-list select').first().selectOption('id');
      await page.waitForFunction((label) => document.querySelector('.herd-panel__title')?.textContent === label, dictionary('id')['common.settings']);
      await page.locator('.herd-panel__header .herd-icon-button').click();
      const phase = await page.locator('.herd-app').getAttribute('data-phase');
      claim('changing language in Settings mid-run keeps the run', phase === 'paused', phase);
      await context.close();
    }
    {
      const { context, page } = await open('&lang=id', {
        routes: (target) => target.route(/\/assets\/id-[\w-]+\.js$/, (route) => route.abort()),
      });
      claim('a dictionary that fails to load leaves a working English game', await shows(page) === dictionary('en')['title.playSolo']);
      claim('and html lang says English', (await facts(page)).lang === 'en');
      await context.close();
    }
    {
      const { context, page } = await open('&lang=id', {
        routes: (target) => target.route(/\/assets\/id-[\w-]+\.js$/, async (route) => {
          await new Promise((resolve) => { setTimeout(resolve, 8_000); });
          await route.continue();
        }),
      });
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('id')['title.playSolo'], { timeout: 30_000 });
      claim('a slow dictionary does not stop the game, and arrives', true);
      await context.close();
    }
    {
      const { context, page, pageErrors } = await open('', {
        routes: (target) => target.addInitScript(() => {
          const real = window.fetch;
          window.fetch = (input, init) => {
            if (String(input?.url ?? input).includes('/api/event')) throw new Error('a wrapper around fetch');
            return real(input, init);
          };
        }),
      });
      claim('a fetch that throws for the counts still mounts the game', await page.locator('.herd-app').count() === 1 && pageErrors.length === 0, pageErrors.join(' '));
      await page.locator('.herd-title-actions .herd-button--primary').click();
      await page.waitForFunction(() => document.querySelector('.herd-app')?.getAttribute('data-phase') === 'playing', undefined, { timeout: 60_000 });
      claim('and a run starts', pageErrors.length === 0, pageErrors.join(' '));
      await context.close();
    }
    {
      const { routes, release } = holdChunk('ko');
      const { context, page } = await open('&lang=ko', { routes });
      await page.locator('.herd-language-picker select').selectOption('de');
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('de')['title.playSolo'], { timeout: 30_000 });
      release();
      await page.waitForTimeout(1_000);
      const seen = await facts(page);
      claim('a dictionary landing late does not undo a newer choice', await shows(page) === dictionary('de')['title.playSolo'] && seen.lang === 'de' && seen.saved === 'de', `${seen.lang} ${seen.saved}`);
      await context.close();
    }
    {
      const { context, page } = await open('', {
        routes: (target) => target.addInitScript(() => {
          Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en-US', 'en'] });
        }),
      });
      await settle(page);
      claim('a browser in Traditional Chinese is not offered Simplified', await page.locator('.herd-language-offer').count() === 0);
      await context.close();
    }
    {
      const { context, page } = await open('', {
        routes: (target) => target.route(/\/assets\/de-[\w-]+\.js$/, (route) => route.abort()),
      });
      await page.locator('.herd-language-picker select').selectOption('de');
      await page.waitForSelector('.herd-language-failed', { timeout: 30_000 });
      const failure = await page.locator('.herd-language-failed').innerText();
      const findings = await page.evaluate(auditScreen, '.herd-title-card');
      claim('a pick that fails says so beside the title picker', failure === dictionary('en')['settings.languageFailed'] && findings.length === 0, JSON.stringify(findings).slice(0, 160));
      await page.locator('.herd-language-picker select').selectOption('ko');
      await page.waitForFunction((label) => document.querySelector('.herd-title-actions .herd-button--primary')?.textContent === label, dictionary('ko')['title.playSolo'], { timeout: 30_000 });
      claim('and a later pick clears it', await page.locator('.herd-language-failed').count() === 0);
      await context.close();
    }
    {
      const { routes, release } = holdChunk('id');
      const { context, page, events } = await open('', { browserLanguage: 'id-ID', routes });
      const play = () => page.locator('.herd-title-actions .herd-button--primary').boundingBox();
      // The card eases up into place as the title becomes ready, which would read as Play moving.
      await page.evaluate(async () => {
        await Promise.allSettled(document.querySelector('.herd-title-card').getAnimations().map((animation) => animation.finished));
      });
      const before = await play();
      release();
      await page.waitForTimeout(1_000);
      const after = await play();
      claim('an offer arriving once Play can be pressed does not appear', await page.locator('.herd-language-offer').count() === 0);
      claim('and Play does not move', before.y === after.y, `${before.y} ${after.y}`);
      claim('and it is not counted as offered', !events.some((event) => event.name === 'language_offered'));
      await page.locator('.herd-title-tools button').nth(1).click();
      await page.locator('.herd-panel__header .herd-icon-button').click();
      await page.waitForSelector('.herd-language-offer', { timeout: 30_000 });
      claim('it appears the next time the title is drawn', true);
      await settle(page);
      claim('and is counted then', events.some((event) => event.name === 'language_offered'));
      await context.close();
    }
    {
      const { context, page, requests } = await open('&lang=de');
      await settle(page);
      claim('German fetches the accented font and not Cyrillic', requests.some((path) => path.includes('latin1')) && !requests.some((path) => path.includes('cyrillic')));
      await context.close();
    }
    {
      const { context, page, requests } = await open('&lang=ru');
      await settle(page);
      claim('Russian fetches the Cyrillic font', requests.some((path) => path.includes('cyrillic')));
      await context.close();
    }
    for (const code of LOCALES.filter((locale) => locale.code !== 'en').map((locale) => locale.code)) {
      const { context, page, requests } = await open(`&lang=${code}`);
      await settle(page);
      claim(`${code} reaches the title in its language`, await shows(page) === dictionary(code)['title.playSolo'] && (await facts(page)).lang === code);
      if (!['es', 'pt-BR', 'fr', 'de', 'ru'].includes(code)) claim(`${code} fetches no extra font`, !requests.some((path) => /latin1|cyrillic/.test(path)));
      await context.close();
    }
  } finally {
    await browser.close();
    stopServer(server);
    removeDir(profile);
  }
  const failed = results.filter((result) => !result.passed);
  console.log(`${results.length - failed.length} of ${results.length} passed`);
  return failed.length === 0;
}

function sizes(root, file) {
  const bytes = readFileSync(join(root, file));
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

function walk(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

async function requestedFiles(dir) {
  const server = await startPreviewServer(port, dir);
  const profile = scratchDir('i18n-probe');
  const browser = await launchBrowser(profile);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    await stubHarnessNetwork(context);
    const page = await context.newPage();
    const requested = new Set();
    const events = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/event') events.push(request.postData()?.length ?? 0);
      if (url.hostname === 'localhost' && !url.pathname.startsWith('/api')) requested.add(url.pathname);
    });
    await page.goto(`http://localhost:${port}/${BOOT_QUERY}`);
    await waitReady(page);
    await page.waitForTimeout(500);
    await context.close();
    return { files: [...requested].map((path) => (path === '/' ? 'index.html' : path.slice(1))), events };
  } finally {
    await browser.close();
    stopServer(server);
    removeDir(profile);
  }
}

async function cost() {
  const base = option('base');
  if (!base) throw new Error('--base <built dir of the earlier commit> is required');
  const summarize = async (dir) => {
    const { files, events } = await requestedFiles(dir);
    const rows = files.map((file) => ({ file, ...sizes(dir, file) }));
    const total = (key) => rows.reduce((sum, row) => sum + row[key], 0);
    const scripts = rows.filter((row) => row.file.endsWith('.js'));
    return {
      requests: rows.length,
      raw: total('raw'),
      gzip: total('gzip'),
      brotli: total('brotli'),
      html: sizes(dir, 'index.html'),
      scripts: scripts.map(({ file, raw, gzip, brotli }) => ({ file, raw, gzip, brotli })),
      artifact: { files: walk(dir).length },
      countsSent: { requests: events.length, bodyBytes: events.reduce((sum, bytes) => sum + bytes, 0) },
    };
  };
  const before = await summarize(base);
  const after = await summarize(builtClientDir);
  const delta = (key) => after[key] - before[key];
  const report = {
    limitation: 'Bytes and request counts for a loaded English title screen. Not timings: this machine is not the timing lane.',
    before, after,
    delta: {
      requests: delta('requests'), raw: delta('raw'), gzip: delta('gzip'), brotli: delta('brotli'),
      htmlRaw: after.html.raw - before.html.raw, htmlBrotli: after.html.brotli - before.html.brotli,
    },
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'cost.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ before: { requests: before.requests, raw: before.raw, gzip: before.gzip, brotli: before.brotli, html: before.html, countsSent: before.countsSent }, after: { requests: after.requests, raw: after.raw, gzip: after.gzip, brotli: after.brotli, html: after.html, countsSent: after.countsSent }, delta: report.delta }, null, 2));
  return true;
}

const commands = { layout, screens, selection, cost };
if (!commands[command]) throw new Error(`Unknown command ${command}`);
process.exitCode = (await commands[command]()) ? 0 : 1;
