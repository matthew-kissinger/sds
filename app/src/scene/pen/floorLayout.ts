// SPDX-License-Identifier: AGPL-3.0-or-later
import { HOME_FIELD } from '@sim/field';

/** Worn earth begins 2 m inside the shared fence. Rendering and grass baking
 * read this same footprint; it is not a collision or retirement threshold. */
export const PEN_FLOOR_RECT = { ...HOME_FIELD.pen, minZ: HOME_FIELD.pen.minZ + 2 };
