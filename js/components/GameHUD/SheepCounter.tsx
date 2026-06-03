/**
 * SheepCounter — sheep progress with an integrated stamina bar and pause button.
 *
 * Cycle 48 P1: converted to JSX .tsx. Cycle 51 P9: pastoral restyle - the shared
 * Icon sheep/pause glyphs replace the bespoke inline SVG, warm cream + gold
 * readouts on the warm .ui-panel glass (was white text + blue percent).
 * Behavior-identical. Positioning lives in HudLayout's topLeft slot (Cycle 35 P8).
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CompactStaminaBar } from './CompactStaminaBar';
import { HudPanel } from './HudPanel';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';

interface SheepCounterProps {
    sheepCount: number;
    totalSheep: number;
    stamina: number;
    onPause?: () => void;
}

/**
 * Type scale:
 *  - Count: text-md (16px), primary info
 *  - Progress: text-sm (12px), secondary info
 */
export function SheepCounter({ sheepCount, totalSheep, stamina, onPause }: SheepCounterProps) {
    const { t } = useTranslation();
    const percentage = Math.round((sheepCount / totalSheep) * 100);

    const pauseButtonStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        background: alpha(pastoral.cream, 10),
        border: `1px solid ${pastoral.glassWarmBorder}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        pointerEvents: 'auto',
        marginLeft: 'auto',
        color: pastoral.cream,
    };

    return (
        <HudPanel className="p-4 min-w-[200px]">
            <div className="flex items-center gap-3">
                <Icon name="sheep" size={26} color={alpha(pastoral.cream, 90)} />
                <div>
                    <div className="text-md font-semibold" style={{ color: pastoral.cream }}>{sheepCount} / {totalSheep}</div>
                    <div className="text-sm" style={{ color: pastoral.accentGold }}>{percentage}% {t('hud.complete')}</div>
                </div>
                {onPause && (
                    <button
                        type="button"
                        style={pauseButtonStyle}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPause();
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = alpha(pastoral.cream, 20);
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = alpha(pastoral.cream, 10);
                        }}
                        title="Pause (ESC)"
                        aria-label="Pause game"
                    >
                        <Icon name="pause" size={16} color={alpha(pastoral.cream, 92)} />
                    </button>
                )}
            </div>
            <CompactStaminaBar stamina={stamina} />
        </HudPanel>
    );
}
