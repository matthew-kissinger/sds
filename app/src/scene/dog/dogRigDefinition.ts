// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Editable bind joints, in the same rest-space metres as the owned loft mesh. */
export interface DogJoint {
  readonly name: string;
  readonly parent: number;
  readonly position: readonly [number, number, number];
}
export const DOG_JOINTS: readonly DogJoint[] = [
  { name: 'root', parent: -1, position: [0, 0, 0] },
  { name: 'pelvis', parent: 0, position: [0, 1.05, -0.56] },
  { name: 'spine', parent: 1, position: [0, 1.07, 0.1] },
  { name: 'chest', parent: 2, position: [0, 1.07, 0.35] },
  { name: 'neck', parent: 3, position: [0, 1.258802, 0.629744] },
  { name: 'head', parent: 4, position: [0, 1.49, 0.89] },
  { name: 'ear-left', parent: 5, position: [0.175, 1.65, 0.81] },
  { name: 'ear-right', parent: 5, position: [-0.175, 1.65, 0.81] },
  { name: 'tail', parent: 1, position: [0, 1.11, -0.9] },
  { name: 'tail-tip', parent: 8, position: [0, 0.91, -1.3] },
  { name: 'fore-left-upper', parent: 3, position: [0.24, 1.05, 0.46] },
  { name: 'fore-left-lower', parent: 10, position: [0.24, 0.73, 0.422] },
  { name: 'fore-left-paw', parent: 11, position: [0.24, 0.2, 0.496] },
  { name: 'fore-right-upper', parent: 3, position: [-0.24, 1.05, 0.46] },
  { name: 'fore-right-lower', parent: 13, position: [-0.24, 0.73, 0.422] },
  { name: 'fore-right-paw', parent: 14, position: [-0.24, 0.2, 0.496] },
  { name: 'hind-left-upper', parent: 1, position: [0.22, 1.13, -0.56] },
  { name: 'hind-left-lower', parent: 16, position: [0.22, 0.63, -0.63] },
  { name: 'hind-left-paw', parent: 17, position: [0.22, 0.2, -0.64] },
  { name: 'hind-right-upper', parent: 1, position: [-0.22, 1.13, -0.56] },
  { name: 'hind-right-lower', parent: 19, position: [-0.22, 0.63, -0.63] },
  { name: 'hind-right-paw', parent: 20, position: [-0.22, 0.2, -0.64] },
];
export const DOG_LEG_ROOTS = [10, 13, 16, 19] as const;
export type DogPart = 'body' | 'tail' | 'ear-left' | 'ear-right'
  | 'fore-left' | 'fore-right' | 'hind-left' | 'hind-right'
  | 'paw-fore-left' | 'paw-fore-right' | 'paw-hind-left' | 'paw-hind-right';
export interface DogPartRange { readonly part: DogPart; readonly start: number; readonly count: number }
