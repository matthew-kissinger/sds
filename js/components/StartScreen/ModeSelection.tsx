/**
 * ModeSelection Component
 * Main menu mode selection - Solo, Multiplayer, Leaderboard, Settings.
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * The per-tile accent hex literals now read the design-token palette; the
 * bespoke inline icons are preserved verbatim as JSX (a lucide swap would be a
 * redesign, not a conversion). The icon-chip background alpha tint is a
 * color-mix() blend (the old `${color}22` suffix, 0x22 -> 13%). Behavior is
 * identical to the previous ModeSelection.js.
 */
import { type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { MenuOption } from '../ui/MenuOption';
import { alpha, color } from '../ui/tokens';

interface ModeDef {
    id: string;
    labelKey: string;
    descKey: string;
    color: string;
    icon: string;
}

// Mode configuration - labels and descriptions are translation keys
const MODES: ModeDef[] = [
    { id: 'solo', labelKey: 'menu.soloPlay', descKey: 'menu.soloPlayDesc', color: color.accent, icon: 'play' },
    { id: 'local', labelKey: 'menu.local2Player', descKey: 'menu.local2PlayerDesc', color: color.huePink, icon: 'gamepad' },
    { id: 'sandbox', labelKey: 'menu.sandbox', descKey: 'menu.sandboxDesc', color: color.staminaOrange, icon: 'sandbox' },
    { id: 'multiplayer', labelKey: 'menu.multiplayer', descKey: 'menu.multiplayerDesc', color: color.infoStrong, icon: 'users' },
    { id: 'leaderboard', labelKey: 'menu.leaderboard', descKey: 'menu.leaderboardDesc', color: color.staminaAmber, icon: 'trophy' },
    { id: 'settings', labelKey: 'menu.settings', descKey: 'menu.settingsDesc', color: color.hueViolet, icon: 'cog' },
];

// SVG Icons (only rendered on desktop)
function ModeIcon({ type, color: iconColor, size = 24 }: { type: string; color: string; size?: number }) {
    const strokeProps = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: iconColor,
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };

    const icons: Record<string, ReactNode> = {
        play: (
            <svg {...strokeProps} fill={iconColor} stroke="none">
                <path d="M8 5v14l11-7z" />
            </svg>
        ),
        sandbox: (
            <svg {...strokeProps}>
                {/* Fence posts */}
                <line x1="4" y1="4" x2="4" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
                <line x1="20" y1="4" x2="20" y2="20" />
                {/* Horizontal rails */}
                <line x1="4" y1="8" x2="20" y2="8" />
                <line x1="4" y1="16" x2="20" y2="16" />
            </svg>
        ),
        users: (
            <svg {...strokeProps}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
        trophy: (
            <svg {...strokeProps}>
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
        ),
        cog: (
            <svg {...strokeProps}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
        ),
        gamepad: (
            <svg {...strokeProps}>
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="8" cy="12" r="2" />
                <path d="M15 9v6" />
                <path d="M18 12h-6" />
            </svg>
        ),
    };

    const icon = icons[type];
    if (!icon) return null;

    // Wrap icon in a styled container
    return (
        <div
            style={{
                padding: '8px',
                borderRadius: '10px',
                background: alpha(iconColor, 13),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {icon}
        </div>
    );
}

interface ModeSelectionProps {
    onSelectMode: (modeId: string) => void;
}

export function ModeSelection({ onSelectMode }: ModeSelectionProps) {
    const { t } = useTranslation();
    const { isCompact, isLandscapeMobile } = useResponsive();

    // Use Tailwind for layout, minimal inline for responsive values
    const gapClass = isLandscapeMobile ? 'gap-1.5' : isCompact ? 'gap-2' : 'gap-4';
    const marginClass = isLandscapeMobile ? 'mt-1' : isCompact ? 'mt-2' : 'mt-4';
    const widthClass = isCompact ? 'w-full' : 'w-[32rem]';

    return (
        <div className={`grid grid-cols-2 ${gapClass} ${widthClass} max-w-full mx-auto ${marginClass} animate-slide-up`}>
            {MODES.map((mode, index) => {
                const style: CSSProperties = { animation: `slideUp 0.5s ease-out ${0.1 + index * 0.08}s both` };
                return (
                    <MenuOption
                        key={mode.id}
                        label={t(mode.labelKey)}
                        description={t(mode.descKey)}
                        accentColor={mode.color}
                        icon={<ModeIcon type={mode.icon} color={mode.color} size={24} />}
                        showArrow={false}
                        onClick={() => onSelectMode(mode.id)}
                        style={style}
                    />
                );
            })}
        </div>
    );
}
