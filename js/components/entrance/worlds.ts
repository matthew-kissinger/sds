/**
 * Cycle 51 P6: the world-first entrance data, promoted from the bake-off shell
 * into the live app. Three worlds (one fenced pasture and two islands), five
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
    tagline: 'A 180-metre island at golden hour. The hero scene.',
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
];

export const DOGS: Dog[] = [
  { id: 'jep', name: 'Jep', portrait: '/assets/dogs/jep.webp', trait: 'Balanced' },
  { id: 'pip', name: 'Pip', portrait: '/assets/dogs/pip.webp', trait: 'Quick' },
  { id: 'sally', name: 'Sally', portrait: '/assets/dogs/sally.webp', trait: 'Steady' },
  { id: 'shiloh', name: 'Shiloh', portrait: '/assets/dogs/shiloh.webp', trait: 'Nimble' },
  { id: 'george_washington', name: 'George Washington', portrait: '/assets/dogs/george_washington.webp', trait: 'Stately' },
];

export const MODES: Mode[] = [
  { id: 'practice', name: 'Just Play', sheep: 30, blurb: 'No timer, no fail state.', ranked: false },
  { id: 'classic', name: 'Classic', sheep: 200, blurb: 'The leaderboard run.', ranked: true },
  { id: 'extreme', name: 'Extreme', sheep: 1000, blurb: 'A thousand sheep.', ranked: true },
  { id: 'insane', name: 'Insane', sheep: 3000, blurb: 'Three thousand sheep.', ranked: true },
  { id: 'chaos', name: 'Chaos', sheep: 5000, blurb: 'The flock becomes the antagonist.', ranked: true },
];

export const WAYS: Way[] = [
  { id: 'online', name: 'Play online' },
  { id: 'sandbox', name: 'Sandbox' },
  { id: 'local', name: '2-player' },
];

/** Format a sheep count with a thousands separator. */
export const formatSheep = (n: number): string => n.toLocaleString('en-US');

/** Default to last-used (or Rolling Hills, the hero) for the armed world. */
export function defaultWorldIndex(lastWorldId: string | null): number {
  const i = WORLDS.findIndex((w) => w.id === lastWorldId);
  return i >= 0 ? i : 1;
}
