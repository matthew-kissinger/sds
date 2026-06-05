// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CountingReadout - the Counting Sheep HUD numbers: the running counted total
 * (the banked score) and the round reached. Shared by the desktop SheepCounter
 * and the mobile MobileHUD so both layouts read identically. Cycle 59 P3.
 *
 * The sheep glyph is owned by the host HUD (it already renders one next to the
 * standard count), so this component is just the two numbers.
 */
import { useTranslation } from 'react-i18next';
import { pastoral } from '../ui/tokens';

interface CountingReadoutProps {
    round: number;
    counted: number;
    /** Mobile: render a single inline line instead of the two-line stack. */
    compact?: boolean;
    /** Font size for the compact (mobile) line, matching the host HUD scale. */
    fontSize?: string;
}

export function CountingReadout({ round, counted, compact = false, fontSize }: CountingReadoutProps) {
    const { t } = useTranslation();
    const roundLabel = t('hud.counting.round');

    if (compact) {
        return (
            <span style={{ color: pastoral.cream, fontSize }}>
                {counted}
                <span style={{ color: pastoral.accentGold }}> {'·'} {roundLabel} {round}</span>
            </span>
        );
    }

    return (
        <div>
            <div className="text-md font-semibold" style={{ color: pastoral.cream }}>{counted}</div>
            <div className="text-sm" style={{ color: pastoral.accentGold }}>{roundLabel} {round}</div>
        </div>
    );
}
