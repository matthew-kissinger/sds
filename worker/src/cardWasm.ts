// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Static wasm import so the worker bundler includes the module. Loaded only
// when a card picture is drawn. Tests pass bytes to useRasterWasm instead.

import wasm from '@resvg/resvg-wasm/index_bg.wasm';

export default wasm;
