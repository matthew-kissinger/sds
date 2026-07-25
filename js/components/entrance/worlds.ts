// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: the world-first entrance data, promoted from the bake-off shell
 * into the live app. Four worlds (one fenced pasture and three islands), five
 * dogs, the five-step solo difficulty ladder, and the secondary ways to play.
 *
 * The world `render` is the fresh close-eye WebGPU capture promoted in P5
 * (assets/scenes/entrance/<id>.webp), not the old marketing OG card. `id`
 * doubles as the scene id the engine builds on commit ('field',
 * 'rolling-hills', 'open-country'). Mode `id` is the canonical solo
 * singlePlayerMode (js/gamestate/modes.js SOLO_MODE_SHEEP_COUNT), passed
 * straight to startSoloGame.
 *
 * Framing follows .claude/rules/prose-and-voice.md: one fenced pasture and two
 * islands, concrete numbers, Matt's voice. No em-dashes, no hype.
 */
import { color } from '../ui/tokens';
import { getSceneById } from '../../../shared/scenes/index.js';
import { getSoloLadder, LEGACY_SOLO_LADDER } from '../../../shared/difficulty.js';
import {
  COUNTING_GAME_MODE,
  COUNTING_HARD_CEILING,
  sceneOffersCounting,
} from '../../../shared/countingModes.js';

export interface World {
  /** Scene id the engine builds on commit. */
  id: string;
  name: string;
  tagline: string;
  /** Fresh close-eye scene render used as the static backdrop. */
  render: string;
  /** Token accent for this biome's active frame. */
  accent: string;
  /** CSS gradient approximation, shown under the image while it decodes. */
  gradient: string;
  /** Work-in-progress world: the entrance shows an Experimental badge. */
  experimental?: boolean;
  /** Not yet playable: the entrance shows a "Coming soon" badge and disables Play. */
  comingSoon?: boolean;
}

export interface Dog {
  id: string;
  name: string;
  portrait: string;
  /** Short handling flavor, one word. */
  trait: string;
}

export interface Mode {
  /** Canonical solo singlePlayerMode id. */
  id: string;
  name: string;
  /** Sheep count for this difficulty. */
  sheep: number;
  blurb: string;
  ranked: boolean;
}

export interface Way {
  id: string;
  name: string;
}

/**
 * Cycle 59 (Counting Sheep): a mode family groups the rungs a world offers under
 * one heading. Home Field and Rolling Hills offer Classic (the solo ladder) and
 * Counting Sheep (the two curves). Open Country is a two-stage gather-and-portal
 * objective, a category of its own, so it carries a single Objective family - a
 * relabel of its solo ladder, no gameplay change. `gameMode` is the top-level
 * mode the commit dispatches: 'solo' for Classic/Objective, 'counting' for the
 * curves. Family + curve names here are a strawman for Matt's voice pass.
 */
export interface ModeFamily {
  id: string;
  name: string;
  /** Top-level gameMode to dispatch on commit: 'solo' | 'counting'. */
  gameMode: string;
  rungs: Mode[];
}

// The Counting Sheep curves as entrance rungs. The rung id is the curve, passed
// straight through as singlePlayerMode (the same slot the solo difficulty uses).
// `sheep` is the shared 5000 ceiling; the chip shows the short curve hint
// (blurb) rather than that number, since a counting run starts at one sheep.
const COUNTING_RUNGS: Mode[] = [
  { id: 'incremental', name: 'Incremental', sheep: COUNTING_HARD_CEILING, blurb: '+1 each round', ranked: true },
  { id: 'exponential', name: 'Exponential', sheep: COUNTING_HARD_CEILING, blurb: 'doubles each round', ranked: true },
];

export const WORLDS: World[] = [
  {
    id: 'field',
    name: 'Home Field',
    tagline: 'A flat fenced pasture. The starter.',
    render: '/assets/scenes/entrance/field.webp',
    accent: color.sceneField,
    gradient: 'linear-gradient(180deg, #cfe3f2 0%, #bcd3a6 55%, #8aa66a 100%)',
  },
  {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    tagline: 'A 180-metre island at golden hour.',
    render: '/assets/scenes/entrance/rolling-hills.webp',
    accent: color.sceneRollingHills,
    gradient: 'linear-gradient(180deg, #f6d8a8 0%, #f0b878 45%, #d99a8f 78%, #b9a6c4 100%)',
  },
  {
    id: 'open-country',
    name: 'Open Country',
    tagline: 'A 380-metre island. Gather the flock and portal it home.',
    render: '/assets/scenes/entrance/open-country.webp',
    accent: color.sceneOpenCountry,
    gradient: 'linear-gradient(180deg, #bcd6e8 0%, #9fc1b0 55%, #6c8f74 100%)',
  },
  {
    id: 'newsheepdogland',
    name: 'Newsheepdogland',
    tagline: 'A boot-shaped survival island. Back in the workshop while it gets rebuilt.',
    render: '/assets/scenes/entrance/newsheepdogland.webp',
    accent: color.sceneNewsheepdogland,
    gradient: 'linear-gradient(180deg, #b9a98c 0%, #8f8a86 45%, #6a6f8c 78%, #3f4a63 100%)',
    // Switched off pending a regression burn-down. The world stays in the carousel
    // as a "Coming soon" tile (badge + disabled Play); the scene + survival code is
    // untouched so a dev can still reach it via ?scene=newsheepdogland.
    comingSoon: true,
  },
];

export const DOGS: Dog[] = [
  { id: 'jep', name: 'Jep', portrait: '/assets/dogs/jep.webp', trait: 'Balanced' },
  { id: 'pip', name: 'Pip', portrait: '/assets/dogs/pip.webp', trait: 'Quick' },
  { id: 'sally', name: 'Sally', portrait: '/assets/dogs/sally.webp', trait: 'Steady' },
  { id: 'shiloh', name: 'Shiloh', portrait: '/assets/dogs/shiloh.webp', trait: 'Nimble' },
  { id: 'george_washington', name: 'George Washington', portrait: '/assets/dogs/george_washington.webp', trait: 'Stately' },
];

/** Map a scene's solo ladder (shared data) into entrance Mode rows. */
function modesFromLadder(
  ladder: ReadonlyArray<{ id: string; count: number; ranked: boolean; label?: string; blurb?: string }>,
): Mode[] {
  return ladder.map((e) => ({
    id: e.id,
    name: e.label ?? e.id,
    sheep: e.count,
    blurb: e.blurb ?? '',
    ranked: e.ranked,
  }));
}

/**
 * Cycle 58: the difficulty options for a world come from that world's scene
 * ladder (per-biome counts), not a flat global list. The entrance reads this
 * for the armed world; an unknown id falls back to the legacy default ladder.
 */
export function modesForWorld(worldId: string): Mode[] {
  return modesFromLadder(getSoloLadder(getSceneById(worldId)));
}

/**
 * The mode families a world offers, in selector order. Counting-capable scenes
 * (Home Field, Rolling Hills) get Classic + Counting Sheep; Open Country gets a
 * single Objective family. A single-family world renders its family as a label,
 * not a selector (see Entrance).
 */
export function familiesForWorld(worldId: string): ModeFamily[] {
  const solo = modesForWorld(worldId);
  if (worldId === 'open-country') {
    return [{ id: 'objective', name: 'Objective', gameMode: 'solo', rungs: solo }];
  }
  // Cycle 66: Newsheepdogland is a survival run - one family, one rung, no
  // sheep-count selection. The run always starts at 10 (scene.survival forces
  // the count); it rides the 'solo' gameMode under the hood.
  if (worldId === 'newsheepdogland') {
    return [{
      id: 'survival', name: 'Survival', gameMode: 'solo',
      rungs: [{ id: 'survival', name: 'Survival', sheep: 10, blurb: 'Herd them home before the wolves.', ranked: true }],
    }];
  }
  // Named "Solo" (not "Classic") so the family chip does not duplicate the
  // "Classic" difficulty rung inside it - clearer for the player, and it keeps
  // the entrance's difficulty selectors unambiguous.
  const families: ModeFamily[] = [{ id: 'solo', name: 'Solo', gameMode: 'solo', rungs: solo }];
  if (sceneOffersCounting(worldId)) {
    families.push({ id: COUNTING_GAME_MODE, name: 'Counting Sheep', gameMode: COUNTING_GAME_MODE, rungs: COUNTING_RUNGS });
  }
  return families;
}

/**
 * Legacy default difficulty list (Home Field-shaped: practice 30 / classic 200 /
 * extreme 1000 / insane 3000 / chaos 5000). Retained as the fallback when no
 * world is armed; live entrances use `modesForWorld(world.id)`.
 */
export const MODES: Mode[] = modesFromLadder(LEGACY_SOLO_LADDER);

export const WAYS: Way[] = [
  { id: 'online', name: 'Play online' },
  { id: 'sandbox', name: 'Sandbox' },
  { id: 'local', name: '2-player' },
];

/** Format a sheep count with a thousands separator. */
export const formatSheep = (n: number): string => n.toLocaleString('en-US');

/**
 * The entrance leads with Home Field. Newsheepdogland is switched
 * off pending a regression burn-down; it stays one "Next world" step away as a
 * "Coming soon" tile (badge + disabled Play). Dog and difficulty persist
 * per-player; the landing world is fixed and never a coming-soon world.
 */
export const DEFAULT_WORLD_INDEX = Math.max(0, WORLDS.findIndex((w) => w.id === 'field'));

/**
 * Resolve the world a `?scene=<id>` deep link should arm (Cycle 112 Phase 7).
 *
 * Browsing worlds is otherwise session-local and the entrance always lands on
 * DEFAULT_WORLD_INDEX. An explicit scene in the URL is the one exception: the
 * engine already builds that scene at boot and retitles the page, so before
 * this the entrance disagreed with the backdrop and Play committed the default.
 *
 * A coming-soon world resolves to the default rather than arming a tile whose
 * Play button is disabled, so a shared link never lands a player somewhere they
 * cannot start. Unknown ids do the same instead of half-applying.
 */
export function worldIndexFromSearch(search: string): number {
  let id: string | null = null;
  try {
    id = new URLSearchParams(search).get('scene');
  } catch {
    return DEFAULT_WORLD_INDEX;
  }
  if (!id) return DEFAULT_WORLD_INDEX;
  const i = WORLDS.findIndex((w) => w.id === id);
  if (i < 0 || WORLDS[i].comingSoon) return DEFAULT_WORLD_INDEX;
  return i;
}
