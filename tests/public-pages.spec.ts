// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOG_COAT_PRESETS } from '@app/scene/dog/dogCustomization';
import { DEFAULT_BARK_CONFIG } from '@sim/BarkImpulse';
import { HOME_FIELD } from '@sim/field';
import { updateStamina } from '@sim/MovementPhysics';
import { createSimState } from '@sim/state';
import {
  BARK_COOLDOWN_TICKS,
  DOG_MAX_SPEED,
  DOG_MAX_STAMINA,
  DOG_SPRINT_SPEED,
  DOG_STAMINA,
  GATE_ATTRACTION_DOG_REACH,
  GATE_ATTRACTION_RANGE,
  MIN_STAMINA_TO_SPRINT,
  SHEEP_FLEE_RADIUS,
  SHEEP_MAX_SPEED,
  SHEEP_PERCEPTION_RADIUS,
  SHEEP_VELOCITY_SCALE,
  STAMINA_DRAIN_RATE,
  STAMINA_REGEN_RATE,
} from '@sim/tuning';
import { GRACE_MS } from '../realtime/roomState';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const TICKS_PER_SECOND = 60;

const PAGES = {
  about: 'app/public/about.html',
  support: 'app/public/support.html',
  guide: 'app/public/herding-guide.html',
  multiplayer: 'app/public/multiplayer.html',
  indonesian: 'app/public/id/index.html',
} as const;

/** What a reader sees: the body, without tags. */
const prose = (html: string) => (html.split('<body>')[1] ?? '').replace(/<[^>]+>/g, ' ');

describe('the static pages state what the game does', () => {
  // The guide prints the simulation's numbers, read here from the code, so
  // changing one fails until the page says the new number. A tuning change is an
  // owner decision (AGENTS.md). The two speed ratios are printed as "about",
  // rounded to the nearest half, so they fail only when that rounding changes.
  it('prints the numbers the simulation uses in the herding guide', () => {
    const guide = prose(read(PAGES.guide));
    const sheepTopSpeed = SHEEP_MAX_SPEED * SHEEP_VELOCITY_SCALE;

    expect(guide).toContain(`within ${SHEEP_PERCEPTION_RADIUS} meters`);
    expect(guide).toContain(`Inside ${SHEEP_FLEE_RADIUS} meters of any dog`);
    expect(guide).toContain(`more than ${SHEEP_FLEE_RADIUS} meters to spare`);
    const nearestHalf = (ratio: number) => Math.round(ratio * 2) / 2;
    expect(nearestHalf(DOG_MAX_SPEED / sheepTopSpeed)).toBe(2);
    expect(nearestHalf(DOG_SPRINT_SPEED / sheepTopSpeed)).toBe(3.5);
    expect(guide).toContain('about twice a sheep');
    expect(guide).toContain('about three and a half times');

    // Standing still refills faster inside updateStamina, so ask it.
    const refillSeconds = (speed: number) => {
      const dog = { stamina: 0, velocity: { magnitude: () => speed } };
      updateStamina(dog as never, false, 1, DOG_STAMINA);
      return DOG_MAX_STAMINA / dog.stamina;
    };
    expect(refillSeconds(1)).toBe(DOG_MAX_STAMINA / STAMINA_REGEN_RATE);
    expect(guide).toContain(`A full bar lasts about ${(DOG_MAX_STAMINA - MIN_STAMINA_TO_SPRINT) / STAMINA_DRAIN_RATE} seconds`);
    expect(guide).toContain(`in ${refillSeconds(1)} seconds while you keep moving, or ${refillSeconds(0)} seconds standing still`);

    // Sheep flee by distance alone, whatever the dog's speed. What walking changes
    // is that a sheep can outrun the dog. Effort scales speed in sim/dogMovement.ts.
    const walkEffort = Number(/const WALK_EFFORT = ([\d.]+)/.exec(read('app/src/input/keyboard.ts'))?.[1]);
    expect(walkEffort * DOG_MAX_SPEED).toBeLessThan(sheepTopSpeed);
    expect(guide).toContain(`at ${walkEffort * DOG_MAX_SPEED} meters per second`);

    expect(guide).toContain(`reaches ${DEFAULT_BARK_CONFIG.range} meters`);
    expect(guide).toContain(`${Math.round(Math.acos(DEFAULT_BARK_CONFIG.minDot) * 180 / Math.PI)} degrees either side`);
    expect(guide).toContain(`${DEFAULT_BARK_CONFIG.nearRadius} meters all around`);
    expect(guide).toContain(`within ${DEFAULT_BARK_CONFIG.rippleRadius} meters of one you hit`);
    expect(guide).toContain(`${BARK_COOLDOWN_TICKS / TICKS_PER_SECOND} seconds for the next`);

    expect(guide).toContain(`The gate is ${HOME_FIELD.gate.width} meters wide`);
    expect(guide).toContain(`Within ${GATE_ATTRACTION_RANGE} meters of it`);
    expect(guide).toContain(`within about ${SHEEP_FLEE_RADIUS * GATE_ATTRACTION_DOG_REACH} meters`);
    expect(guide).toContain(`about ${HOME_FIELD.spawn.spreadRadius * 2} meters across`);
  });

  it('describes how each flock size starts', () => {
    // The guide and the about page say every size starts in one circle, and that
    // sizes differ in how the sheep group: sheep linked by what a sheep can sense.
    const SEEDS = Array.from({ length: 10 }, (_, index) => 1000 + index * 37);
    const { center, spreadRadius } = HOME_FIELD.spawn;
    const largestShare = (flock: number) => SEEDS.reduce((total, seed) => {
      const points = createSimState(HOME_FIELD, flock, seed).sheep.map(({ position }) => position);
      for (const { x, z } of points) expect(Math.hypot(x - center.x, z - center.z)).toBeLessThanOrEqual(spreadRadius);
      const unseen = new Set(points);
      let largest = 0;
      for (const start of points) {
        if (!unseen.delete(start)) continue;
        const stack = [start];
        let size = 0;
        while (stack.length > 0) {
          const { x, z } = stack.pop()!;
          size += 1;
          for (const other of [...unseen]) {
            if (Math.hypot(other.x - x, other.z - z) < SHEEP_PERCEPTION_RADIUS) {
              unseen.delete(other);
              stack.push(other);
            }
          }
        }
        largest = Math.max(largest, size);
      }
      return total + largest / flock / SEEDS.length;
    }, 0);
    expect(largestShare(25)).toBeLessThan(0.5);
    expect(largestShare(75)).toBeGreaterThan(0.3);
    expect(largestShare(75)).toBeLessThan(0.8);
    expect(largestShare(200)).toBeGreaterThan(0.9);
  });

  it('keeps the cooldown on the help page and the Indonesian page true', () => {
    const seconds = BARK_COOLDOWN_TICKS / TICKS_PER_SECOND;
    expect(prose(read(PAGES.support))).toContain(`${seconds} second cooldown`);
    expect(prose(read(PAGES.indonesian))).toContain(`jeda ${String(seconds).replace('.', ',')} detik`);
  });

  it('tells a multiplayer reader how many rooms exist', () => {
    // Owned by the realtime service. If capacity is raised, these sentences go
    // with it: both pages promise a reader one room per region.
    const { vars } = JSON.parse(read('realtime/wrangler.json')) as { vars: { ROOM_CAPS: Record<string, number> } };
    expect(vars.ROOM_CAPS).toEqual({ na: 1, eu: 1, apac: 1 });
    expect(prose(read(PAGES.multiplayer))).toContain('each region hosts one room at a time');
    expect(prose(read(PAGES.indonesian))).toContain('tiap wilayah hanya bisa menampung satu room sekaligus');
    expect(prose(read(PAGES.multiplayer))).toContain(`${GRACE_MS / 1000} seconds to come back`);
  });

  it('no longer calls the game single-player', () => {
    for (const path of [PAGES.about, PAGES.support]) {
      expect(read(path)).not.toMatch(/single-player browser game|free single-player/i);
    }
  });

  it('writes player-facing prose without exclamation marks or emoji', () => {
    for (const path of Object.values(PAGES)) {
      const text = prose(read(path));
      expect(text, path).not.toContain('!');
      expect(text, path).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('stays with the fact about phones', () => {
    // Touch controls are a fact. Working on any given phone is not established
    // on a real device (AGENTS.md, measurement lanes), so the English pages say
    // touch screen, and the Indonesian page answers the question its readers
    // ask with what is known: it can be tried, and not every phone runs it well.
    for (const path of [PAGES.about, PAGES.support, PAGES.guide, PAGES.multiplayer]) {
      expect(prose(read(path)), path).not.toMatch(/\b(phone|mobile|smartphone)\b/i);
    }
    const indonesian = prose(read(PAGES.indonesian));
    expect(indonesian).toContain('Bisa dimainkan di HP?');
    expect(indonesian).toContain('Bisa dicoba.');
    expect(indonesian).toContain('tidak semua HP berjalan lancar');
    expect(indonesian).not.toMatch(/\b(pasti bisa|semua HP bisa|lancar di semua)\b/i);
    for (const path of Object.values(PAGES)) {
      expect(read(path), path).not.toMatch(/\b(apk|android|iphone|ios)\b/i);
    }
  });

  it('describes the Studio as it is', () => {
    expect(Object.keys(DOG_COAT_PRESETS)).toHaveLength(5);
    expect(prose(read(PAGES.about))).toContain('five dog coats');
    expect(prose(read(PAGES.indonesian))).toContain('lima warna bulu');
  });

  it('names what the Indonesian page names as the game does', () => {
    // The page does not read the dictionary, so nothing else would notice a coat or a
    // button that the game has since renamed.
    const dictionary = JSON.parse(read('app/src/i18n/locales/id.json')) as Record<string, string>;
    const page = prose(read(PAGES.indonesian)).replaceAll('&amp;', '&');
    const named = [
      ...Object.keys(DOG_COAT_PRESETS).map((coat) => `coat.${coat}.name`),
      'title.customize', 'title.playSolo', 'title.multiplayer', 'studio.tabSheep',
      'touch.sprint', 'touch.bark', 'touch.camera', 'mp.region.apac', 'common.settings',
    ];
    for (const key of named) expect(page, key).toContain(dictionary[key]);
  });
});

describe('the discovery surface around them', () => {
  it('keeps the brand first in every title it set', () => {
    for (const path of [PAGES.about, PAGES.guide, PAGES.multiplayer]) {
      expect(read(path), path).toMatch(/<title>Sheepdog Sim\b/);
    }
  });

  it('holds the Indonesian page to its approved head', () => {
    const page = read(PAGES.indonesian);
    expect(page.match(/<title>([^<]+)<\/title>/)![1]).toBe('Game Anjing Gembala Domba Gratis di Browser, Tanpa Download');
    expect(page.match(/property="og:title" content="([^"]+)"/)![1]).toBe('Game anjing gembala gratis di browser');
    expect(page.match(/<h1>([^<]+)<\/h1>/)![1]).toBe('Game anjing gembala gratis di browser');
  });

  it('keeps titles and descriptions short enough to show in full', () => {
    for (const path of Object.values(PAGES)) {
      const html = read(path);
      expect(html.match(/<title>([^<]+)<\/title>/)![1]!.length, path).toBeLessThanOrEqual(60);
      expect(html.match(/name="description" content="([^"]+)"/)![1]!.length, path).toBeLessThanOrEqual(160);
    }
  });

  it('holds the Indonesian page to what it was approved as', () => {
    const page = read(PAGES.indonesian);
    expect(page).toContain('<html lang="id">');
    expect(page).toContain('rel="canonical" href="https://sheepdogsim.com/id/"');
    expect(page).toContain('property="og:locale" content="id_ID"');
    expect(page).toContain('href="/?lang=id">Main sekarang</a>');
    // docs/operations/public-discovery.md says what this does and does not do.
    const gameLinks = page.match(/<a\b[^>]*href="\/\?lang=id"[^>]*>/g)!;
    expect(gameLinks.length).toBeGreaterThan(0);
    for (const link of gameLinks) expect(link).toContain('rel="nofollow"');
    expect(page).toContain('href="/about"');
    expect(read(PAGES.about)).toContain('href="/id/"');
    expect(read(PAGES.support)).toContain('href="/id/"');
    // Not the game: no client bundle, no renderer.
    expect(page).not.toContain('/src/main.tsx');
    expect(page).not.toMatch(/<canvas/);
  });

  it('carries no hreflang between the English site and the Indonesian page', () => {
    // By the owner's decision.
    for (const path of ['app/index.html', ...Object.values(PAGES)]) {
      expect(read(path), path).not.toContain('hreflang');
    }
    expect(read('app/public/sitemap.xml')).not.toContain('hreflang');
    expect(read('app/public/sitemap.xml')).not.toContain('xhtml:link');
  });

  it('lists the new pages in the sitemap and in llms.txt', () => {
    const sitemap = read('app/public/sitemap.xml');
    const llms = read('app/public/llms.txt');
    for (const path of ['/herding-guide', '/multiplayer', '/id/']) {
      // /id/ alone may be withdrawn from search, and then it must be noindexed too.
      if (path === '/id/' && !sitemap.includes(`<loc>https://sheepdogsim.com${path}</loc>`)) {
        expect(read(PAGES.indonesian)).toMatch(/name="robots" content="[^"]*noindex/);
        expect(llms).not.toContain(`(https://sheepdogsim.com${path})`);
        continue;
      }
      expect(sitemap).toContain(`<loc>https://sheepdogsim.com${path}</loc>`);
      expect(llms).toContain(`(https://sheepdogsim.com${path})`);
      if (path === '/id/') expect(read(PAGES.indonesian)).not.toMatch(/name="robots" content="[^"]*noindex/);
    }
  });

  it('sizes every screenshot it uses and ships every one', () => {
    const shots = new Set<string>();
    for (const path of Object.values(PAGES)) {
      for (const [tag] of read(path).matchAll(/<img\b[^>]*>/g)) {
        expect(tag, path).toMatch(/\bwidth="\d+"/);
        expect(tag, path).toMatch(/\bheight="\d+"/);
        expect(tag, path).toMatch(/\balt="[^"]{20,}"/);
        const source = tag.match(/src="\/(shots\/[^"]+)"/)?.[1];
        expect(source, tag).toBeTruthy();
        shots.add(source!);
      }
    }
    const jsonLd = read('app/index.html').match(/"screenshot": \[([\s\S]*?)\]/)![1]!;
    for (const [, name] of jsonLd.matchAll(/sheepdogsim\.com\/(shots\/[^"]+)"/g)) shots.add(name!);
    for (const shot of shots) expect(existsSync(new URL(`../app/public/${shot}`, import.meta.url)), shot).toBe(true);
  });

  it('leaves the game page without images of its own', () => {
    // The shots are for the static pages. The game's first load stays as it was.
    const game = read('app/index.html');
    expect(game).not.toMatch(/<img\b/);
    expect(game).not.toMatch(/rel="preload"[^>]*shots\//);
  });
});
