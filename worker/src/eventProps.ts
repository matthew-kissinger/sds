// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Cycle 86 Phase 2 (P0-CRASH follow-up): /api/event prop caps. Crash stacks
// from the client ErrorBoundary run ~4 KB, so the `stack` key gets its own
// cap; every other string prop keeps the original 256. The encoded propsJson
// total is bounded separately. All caps are applied to the RAW string value
// BEFORE JSON-encoding - the old code sliced the encoded JSON, which could
// cut mid-escape (e.g. a stack ending in `\n` -> dangling backslash) and
// store invalid JSON.
//
// Lives in its own module (not index.ts) because the Workers runtime treats
// every export of the ENTRY module as a handler: a `export const <number>`
// there fails startup with "Incorrect type for map entry ... not of type
// 'function or ExportedHandler'".

export const EVENT_STRING_PROP_CAP = 256;
export const EVENT_STACK_PROP_CAP = 4096;
export const EVENT_PROPS_JSON_CAP = 8192;

// Truncate a raw (not yet JSON-encoded) string. If the cut would split a
// surrogate pair, the dangling high surrogate is dropped too so the stored
// value stays a well-formed code-point sequence.
export function truncateRawString(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

// Encode props to JSON under a total length cap WITHOUT slicing the encoded
// string (a mid-escape slice is invalid JSON). If the encoded form is over
// the cap, repeatedly halve the longest string value and re-encode; with at
// most 16 keys this converges in a few passes and the result always parses.
// Returns '{}' if nothing shrinkable remains (pathologically long keys).
export function encodePropsJson(
  props: Record<string, string | number | boolean>,
  cap: number,
): string {
  let json = JSON.stringify(props);
  while (json.length > cap) {
    let longestKey: string | null = null;
    let longestLen = 0;
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' && v.length > longestLen) {
        longestKey = k;
        longestLen = v.length;
      }
    }
    if (!longestKey) return '{}';
    props[longestKey] = truncateRawString(props[longestKey] as string, Math.floor(longestLen / 2));
    json = JSON.stringify(props);
  }
  return json;
}
