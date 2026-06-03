// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * MobileHUD — compact mobile status bar (sheep count, timer, stamina, pause).
 *
 * Cycle 51 P9: migrated from createElement .js to JSX .tsx and restyled onto the
 * pastoral language - a warm scrim + warm hairline (was a cool-white-bordered
 * dark panel), the shared Icon sheep/timer/pause glyphs (was bespoke inline SVG),
 * cream readouts. The stamina green->amber->red ramp + the exhausted-pulse stay
 * (semantic). Behavior-identical; positioning is HudLayout's topCenter slot.
 */
import type { CSSProperties } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';

interface MobileHUDProps {
    gameData: { gameTime: number; sheepCount: number; totalSheep: number };
    stamina: number;
    onPause?: () => void;
}

// Stamina ramp: green (healthy) -> amber (mid) -> red (low). Semantic, unchanged.
function getStaminaColor(stamina: number): string {
    if (stamina >= 60) return 'linear-gradient(90deg, #10b981, #34d399)';
    if (stamina >= 30) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    return 'linear-gradient(90deg, #ef4444, #f87171)';
}

export function MobileHUD({ gameData, stamina, onPause }: MobileHUDProps) {
    const { isLandscapeMobile } = useResponsive();

    const minutes = Math.floor(gameData.gameTime / 60);
    const seconds = Math.floor(gameData.gameTime % 60);

    const iconSize = isLandscapeMobile ? 12 : 16;
    const fontSize = isLandscapeMobile ? '0.75rem' : '0.875rem';
    const gap = isLandscapeMobile ? '0.5rem' : '1rem';
    const padding = isLandscapeMobile ? '0.25rem 0.5rem' : '0.5rem';
    const staminaHeight = isLandscapeMobile ? '3px' : '4px';

    const panelStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: isLandscapeMobile ? '0.5rem' : '0.75rem',
        background: 'rgba(43, 38, 32, 0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: '10px',
        border: `1px solid ${pastoral.glassWarmBorder}`,
        padding,
    };

    const pauseButtonStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: isLandscapeMobile ? '24px' : '32px',
        height: isLandscapeMobile ? '24px' : '32px',
        background: alpha(pastoral.cream, 15),
        border: `1px solid ${pastoral.glassWarmBorder}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        WebkitTapHighlightColor: 'transparent',
        pointerEvents: 'auto',
        color: pastoral.cream,
    };

    return (
        <div style={{ animation: 'slideDown 0.5s ease-out', pointerEvents: 'auto' }}>
            <div style={panelStyle}>
                <button
                    type="button"
                    style={pauseButtonStyle}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPause?.(); }}
                    onTouchStart={(e) => { e.currentTarget.style.background = alpha(pastoral.cream, 28); e.currentTarget.style.transform = 'scale(0.95)'; }}
                    onTouchEnd={(e) => { e.currentTarget.style.background = alpha(pastoral.cream, 15); e.currentTarget.style.transform = 'scale(1)'; }}
                    aria-label="Pause game"
                >
                    <Icon name="pause" size={isLandscapeMobile ? 12 : 16} color={alpha(pastoral.cream, 92)} />
                </button>

                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Icon name="sheep" size={iconSize} color={alpha(pastoral.cream, 85)} />
                            <span style={{ color: pastoral.cream, fontSize }}>{gameData.sheepCount}/{gameData.totalSheep}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Icon name="timer" size={iconSize - 2} color={alpha(pastoral.cream, 85)} />
                            <span style={{ color: pastoral.cream, fontFamily: 'monospace', fontSize }}>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
                        </div>
                    </div>
                    <div style={{
                        marginTop: isLandscapeMobile ? '0.125rem' : '0.25rem',
                        height: staminaHeight,
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        background: alpha(pastoral.ink, 35),
                        minWidth: isLandscapeMobile ? '100px' : '120px',
                    }}>
                        <div
                            className={stamina <= 0 ? 'stamina-bar-exhausted' : ''}
                            style={stamina <= 0
                                ? { height: '100%', width: '100%', borderRadius: '9999px' }
                                : {
                                    height: '100%',
                                    width: `${stamina}%`,
                                    background: getStaminaColor(stamina),
                                    boxShadow: stamina < 30 ? '0 0 6px rgba(239, 68, 68, 0.5)' : 'none',
                                    transition: 'background 0.3s ease-out, box-shadow 0.3s ease-out',
                                    borderRadius: '9999px',
                                }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
