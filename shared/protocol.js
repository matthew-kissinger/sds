// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The multiplayer wire-protocol version.
 *
 * Cycle 67 P5: the first explicit protocol version tag. Before this cycle the
 * gameStateUpdate frame carried no version (implicitly v1). The DO now stamps
 * `v: PROTOCOL_VERSION` on every snapshot, and the client sends its
 * `protocolVersion` on room create/join.
 *
 * The tag exists so the DO can REFUSE a survival-room join from a client too old
 * to render it. Survival frames carry additive blocks (a `survival` object, a
 * `wolves` array, and a `killed` flag on dormant/wolf-killed sheep). A
 * pre-survival client (no/old `protocolVersion`) ignores those fields, which
 * would make it render the hidden dormant pool as live sheep. Refusing the join
 * is cleaner than letting it mis-render. Non-survival frames stay backward-
 * compatible: the new blocks are absent and old clients ignore the `v` field.
 *
 * Bump PROTOCOL_VERSION whenever a wire change would mis-render on an old client,
 * and raise the matching MIN constant for the affected room kind.
 *
 * P2-DELTA (v3): changed-sheep delta broadcasts. A v3-capable DO sends sessions
 * that joined with protocolVersion >= DELTA_MIN_PROTOCOL_VERSION a keyframe
 * (full `gameStateUpdate`, additive `tick` field) every KEYFRAME_INTERVAL_TICKS
 * ticks and a `gameStateDelta` (changed sheep only, keyed by array index)
 * otherwise. Sessions below the delta minimum (or with no version at all) keep
 * receiving full `gameStateUpdate` frames every broadcast interval, byte-
 * compatible with v2 except the additive `tick` field - per-client soft-degrade,
 * no refusal. SURVIVAL_MIN_PROTOCOL_VERSION stays 2: v3 satisfies it, and the
 * survival gate is about mis-rendering, not bandwidth. Full design:
 * docs/hardening/delta-protocol-design.md.
 */

/** Current wire-protocol version the client speaks and the DO stamps. */
export const PROTOCOL_VERSION = 3;

/** Minimum protocol version required to JOIN a survival room. */
export const SURVIVAL_MIN_PROTOCOL_VERSION = 2;

/**
 * Minimum session protocol version to receive the keyframe + `gameStateDelta`
 * cadence. Sessions below it (or with no stored version) get legacy full
 * `gameStateUpdate` frames every broadcast interval.
 */
export const DELTA_MIN_PROTOCOL_VERSION = 3;

/**
 * Keyframe cadence for delta-capable sessions: a full `gameStateUpdate` every
 * N sim ticks (60 = 1 s at the 60Hz tick rate; drift insurance, not loss
 * repair - the WS transport is reliable and ordered).
 */
export const KEYFRAME_INTERVAL_TICKS = 60;
