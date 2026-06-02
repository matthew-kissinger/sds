/**
 * Cycle 51: the bake-off registry. Ordered list of the ten prototypes the
 * harness renders. Each skin folder default-exports a SkinModule. To retire a
 * loser, delete its folder and its line here; to promote the winner, this is
 * the manifest the wiring phase reads.
 */
import type { SkinModule } from '../shell/types';
import goldenPasture from './golden-pasture';
import storybook from './storybook';
import livingDiorama from './living-diorama';
import wideOpen from './wide-open';
import launcher from './launcher';
import biomeCards from './biome-cards';
import zenType from './zen-type';
import warmCinematic from './warm-cinematic';
import modeFirst from './mode-first';
import oneTapHero from './one-tap-hero';

export const SKINS: SkinModule[] = [
  goldenPasture,
  storybook,
  livingDiorama,
  wideOpen,
  launcher,
  biomeCards,
  zenType,
  warmCinematic,
  modeFirst,
  oneTapHero,
];
