// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CompactStaminaBar — small stamina bar embedded inside other HUD readouts.
 * Smooth gradient: green -> amber -> orange -> red.
 *
 * Cycle 48 P1: converted to JSX .tsx; the gradient stops + low-stamina glow are
 * design tokens (color.* -> var(--color-*)) instead of raw hex. The amber/orange
 * mid-stops are the new --color-stamina-* tokens; the green/red ends reuse
 * accent/success/danger/danger-soft.
 */
import type { CSSProperties } from 'react';
import { color } from '../ui/tokens';

/** Stamina fill gradient keyed to the remaining-percent band. */
function getStaminaColor(stamina: number): string {
    if (stamina >= 60) {
        // Green zone (60-100%)
        return `linear-gradient(90deg, ${color.accent}, ${color.success})`;
    } else if (stamina >= 30) {
        // Yellow/Orange zone (30-60%)
        const t = (stamina - 30) / 30; // 0 at 30%, 1 at 60%
        if (t > 0.5) {
            return `linear-gradient(90deg, ${color.staminaAmber}, ${color.warn})`; // Yellow
        }
        return `linear-gradient(90deg, ${color.staminaOrange}, ${color.warnStrong})`; // Orange
    }
    // Red zone (0-30%)
    return `linear-gradient(90deg, ${color.danger}, ${color.dangerSoft})`;
}

/** Low-stamina warning glow; red halo under 30%, none otherwise. */
function getGlowStyle(stamina: number): string {
    if (stamina < 30) {
        return `0 0 8px color-mix(in srgb, ${color.danger} 50%, transparent)`;
    }
    return 'none';
}

export function CompactStaminaBar({ stamina }: { stamina: number }) {
    const staminaValue = Math.round(stamina);
    // Cycle 8: pulse the bar while stamina is fully empty, so the
    // exhaustion event has a clear visual cue. The dog auto-stops
    // sprinting at 0 (Sheepdog.updateStamina), but smoothMaxSpeed
    // eases velocity back to walk over ~200ms - the pulse fills in
    // the missing "you ran out!" beat.
    const isExhausted = staminaValue <= 0;

    const fillClassName = isExhausted
        ? 'h-full rounded-full stamina-bar-exhausted'
        : 'h-full rounded-full transition-[background,box-shadow] duration-300';

    const fillStyle: CSSProperties = isExhausted
        ? { width: '100%' }
        : {
            width: `${staminaValue}%`,
            background: getStaminaColor(stamina),
            boxShadow: getGlowStyle(stamina),
        };

    return (
        <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-white/70 text-xs mb-1 flex justify-between">
                <span>Stamina</span>
                <span className={staminaValue < 30 ? 'text-red-400' : 'text-white/50'}>{staminaValue}%</span>
            </div>
            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
                <div className={fillClassName} style={fillStyle} />
            </div>
        </div>
    );
}
