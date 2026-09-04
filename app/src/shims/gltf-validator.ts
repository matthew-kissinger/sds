// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Browser shim for gltf-validator to bypass Dart runtime evaluation in client browser.
// Full gltf validation is performed offline during font baking (`node tools/bake-font.mjs`).

export async function validateBytes(_bytes: Uint8Array, _options?: Record<string, unknown>) {
  return {
    validatorVersion: '2.0.0-dev.3.10',
    issues: {
      truncated: false,
      numErrors: 0,
      numWarnings: 0,
      messages: [],
    },
  };
}
