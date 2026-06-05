// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CountingBankButton - the always-visible "bank and finish" control for a
 * Counting Sheep run. Counting never auto-ends, so this is how the player
 * chooses to log the score and see the summary. Rendered only when the active
 * mode is round-based (Cycle 59 P4). Pointer-events auto so it is tappable
 * through the otherwise pass-through HUD layer, on desktop and mobile.
 */
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';

interface CountingBankButtonProps {
    onBank?: () => void;
}

export function CountingBankButton({ onBank }: CountingBankButtonProps) {
    const { t } = useTranslation();
    const label = t('hud.counting.bank');

    return (
        <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBank?.(); }}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.95rem',
                background: `linear-gradient(135deg, ${pastoral.accentMeadow}, ${pastoral.accentGold})`,
                color: pastoral.cream,
                border: `1px solid ${pastoral.glassWarmBorder}`,
                borderRadius: '0.75rem',
                cursor: 'pointer',
                pointerEvents: 'auto',
                fontWeight: 600,
                fontSize: '0.9rem',
                boxShadow: `0 4px 14px ${alpha(pastoral.ink, 30)}`,
                transition: 'transform 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
            }}
            aria-label={label}
        >
            <Icon name="trophy" size={18} color={pastoral.cream} />
            {label}
        </button>
    );
}
