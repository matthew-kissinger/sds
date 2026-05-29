/**
 * DogSelection Component
 * Dog selection grid with stats display and visual avatars.
 * Responsive: adapts to mobile portrait and landscape.
 *
 * Cycle 11 Phase 3 produced real WebP/PNG thumbnails via the cinematic
 * pipeline (`?cinematic=1` + window.__sdsCinema.mountDogShowcase). Each dog
 * now renders as `<img>` against a colored backdrop. Fallback path: the
 * svg avatar is preserved below for browsers/devices that fail to load
 * the asset.
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * Each dog's accent hex now reads the design-token palette; the per-card
 * selection tints (background / border / shadow) are color-mix() blends via
 * the shared alpha() helper (the old `${color}22`-style suffixes). Behavior is
 * identical to the previous DogSelection.js.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { PanelTitle } from '../ui/Panel';
import { alpha, color as token } from '../ui/tokens';

interface DogAvatarProps {
    id: string;
    color?: string;
    size?: number;
}

const DogAvatar = ({ id, color = token.infoStrong, size = 48 }: DogAvatarProps) => {
    const [errored, setErrored] = useState(false);
    const inner = errored ? (
        <svg width={size - 12} height={size - 12} viewBox="0 0 512 512" fill={color}>
            <path d="m231.6 16.18 16.7 120.02 73.8 20.5c37.3-11.2 78.5-18.2 102.3-43.6 9.7-10.3 17.2-24.78 9.1-37.92l-75.3 2.22-14.6-31.79h-74.7c-7.7-11.71-22.8-20.46-37.3-29.43zm5.7 145.22c-46.9 19.8-110.1 146.3-111.8 276.5-34.02-58.1-24.9-122.6-2.9-202.6C55.31 287 4.732 448.4 133.1 486.9H346s-6.3-21.5-14.1-28.9c-12.7-12-48.2-20.2-48.2-20.2 27.8-39.2 33.5-71.7 38.6-103.9 4.5 59.8 40.7 126.8 57.4 153h76.5s4.6-15.9.2-21.5c-10.9-13.8-51.3-11.9-51.3-11.9-31.1-107.2-46.3-260.2-90-273.2-21.7-6.5-54.3-14.1-77.8-18.9z" />
        </svg>
    ) : (
        <img
            src={`/assets/dogs/${id}.webp`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            onError={() => setErrored(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
        />
    );
    return (
        <div
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: alpha(color, 13),
                borderRadius: '12px',
                padding: errored ? '6px' : 0,
                overflow: 'hidden',
            }}
        >
            {inner}
        </div>
    );
};

interface DogDef {
    id: string;
    translationKey: string;
    stats: { speed: number; stamina: number; control: number };
    color: string;
}

// Dog data with stats and avatar colors - using translation keys
const DOGS: DogDef[] = [
    { id: 'jep', translationKey: 'jep', stats: { speed: 3, stamina: 4, control: 4 }, color: token.infoStrong },
    { id: 'pip', translationKey: 'pip', stats: { speed: 5, stamina: 3, control: 3 }, color: token.staminaAmber },
    { id: 'sally', translationKey: 'sally', stats: { speed: 2, stamina: 4, control: 5 }, color: token.huePink },
    { id: 'shiloh', translationKey: 'shiloh', stats: { speed: 3, stamina: 5, control: 3 }, color: token.accent },
    { id: 'george_washington', translationKey: 'georgeWashington', stats: { speed: 3, stamina: 4, control: 3 }, color: token.hueViolet },
];

interface StatBarProps {
    label: ReactNode;
    value: number;
    maxValue?: number;
    color?: string;
    isCompact?: boolean;
}

/**
 * StatBar - Dog stat visualization
 * Type scale: text-xs (10px) for labels/values, consistent with type system
 */
function StatBar({ label, value, maxValue = 5, color = token.infoStrong, isCompact = false }: StatBarProps) {
    const percentage = (value / maxValue) * 100;

    // Use type scale: text-xs for compact, text-sm for normal
    const textClass = isCompact ? 'text-xs' : 'text-sm';
    const labelWidth = isCompact ? 'w-10' : 'w-16';
    const barHeight = isCompact ? 'h-1' : 'h-2';
    const marginClass = isCompact ? 'mb-0.5' : 'mb-1';

    return (
        <div className={`flex items-center gap-2 ${marginClass}`}>
            <span className={`${textClass} text-white/70 ${labelWidth}`}>{label}</span>
            <div className={`flex-1 ${barHeight} rounded-full overflow-hidden bg-gray-700/50`}>
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%`, background: `linear-gradient(90deg, ${color}, ${alpha(color, 87)})` }}
                />
            </div>
            <span className={`${textClass} text-white/80 w-4 text-right`}>{value}</span>
        </div>
    );
}

interface DogSelectionProps {
    selectedDog: string;
    onSelect: (id: string) => void;
}

export function DogSelection({ selectedDog, onSelect }: DogSelectionProps) {
    const { t } = useTranslation();
    const { isCompact, isLandscapeMobile, isVeryCompact } = useResponsive();

    // Responsive grid: 5 cols desktop, 2 cols mobile portrait, 5 cols landscape
    const gridColsClass = isLandscapeMobile ? 'grid-cols-5' : isCompact ? 'grid-cols-2' : 'grid-cols-5';
    const gapClass = isCompact ? 'gap-1.5' : 'gap-4';
    const maxWidthClass = isCompact ? 'max-w-[calc(100vw-2rem)]' : 'max-w-4xl';

    const avatarSize = isCompact ? 40 : 56;
    const paddingClass = isCompact ? 'p-2' : 'p-4';
    const radiusClass = isCompact ? 'rounded-xl' : 'rounded-2xl';

    return (
        <div className={`w-full mx-auto ${maxWidthClass} animate-slide-up`}>
            <PanelTitle>{t('dogs.title')}</PanelTitle>

            <div className={`grid ${gridColsClass} ${gapClass}`}>
                {DOGS.map((dog) => {
                    const isSelected = selectedDog === dog.id;

                    // Card classes - mostly Tailwind, dynamic colors via style
                    const cardClasses = `
                        ${paddingClass} ${radiusClass}
                        text-left cursor-pointer
                        backdrop-blur-xl
                        transition-all duration-300
                        ${isSelected ? 'scale-[1.02]' : 'scale-100'}
                    `.trim().replace(/\s+/g, ' ');

                    const cardStyle: CSSProperties = {
                        background: isSelected
                            ? `linear-gradient(135deg, ${alpha(dog.color, 13)}, ${alpha(dog.color, 7)})`
                            : 'rgba(255, 255, 255, 0.08)',
                        border: isSelected
                            ? `2px solid ${alpha(dog.color, 53)}`
                            : '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: isSelected
                            ? `0 4px 20px ${alpha(dog.color, 20)}`
                            : '0 4px 16px rgba(0, 0, 0, 0.1)',
                    };

                    return (
                        <button key={dog.id} onClick={() => onSelect(dog.id)} className={cardClasses} style={cardStyle}>
                            {/* Selection indicator */}
                            {isSelected && (
                                <div
                                    className={`absolute ${isCompact ? 'top-1 right-1 w-[18px] h-[18px]' : 'top-2 right-2 w-6 h-6'} rounded-full flex items-center justify-center`}
                                    style={{ background: dog.color, boxShadow: `0 2px 8px ${alpha(dog.color, 40)}` }}
                                >
                                    <svg
                                        width={isCompact ? '10' : '14'}
                                        height={isCompact ? '10' : '14'}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="white"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </div>
                            )}

                            {/* Dog avatar - hide on very compact */}
                            {!isVeryCompact && (
                                <div
                                    className={`flex justify-center ${isCompact ? 'mb-1.5' : 'mb-3'} ${isSelected ? 'opacity-100' : 'opacity-80'} transition-opacity duration-300`}
                                >
                                    <DogAvatar id={dog.id} color={dog.color} size={avatarSize} />
                                </div>
                            )}

                            {/* Dog name and breed - using type scale */}
                            <div className={`relative ${isCompact ? 'mb-1' : 'mb-3'} text-center`}>
                                {/* Name: text-base (14px) compact, text-lg (20px) normal */}
                                <h3
                                    className={`font-bold truncate ${isCompact ? 'text-base' : 'text-lg'}`}
                                    style={{ color: isSelected ? dog.color : token.text }}
                                >
                                    {t(`dogs.${dog.translationKey}.name`)}
                                </h3>
                                {/* Breed: text-xs (10px) compact, text-sm (12px) normal */}
                                {!isVeryCompact && (
                                    <p className={`text-white/60 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                                        {t(`dogs.${dog.translationKey}.breed`)}
                                    </p>
                                )}
                            </div>

                            {/* Stats - hide on very compact */}
                            {!isVeryCompact && (
                                <div>
                                    <StatBar label={t('dogs.stats.speed')} value={dog.stats.speed} color={dog.color} isCompact={isCompact} />
                                    <StatBar label={t('dogs.stats.stamina')} value={dog.stats.stamina} color={dog.color} isCompact={isCompact} />
                                    <StatBar label={t('dogs.stats.control')} value={dog.stats.control} color={dog.color} isCompact={isCompact} />
                                </div>
                            )}

                            {/* Description - hide on compact. Type scale: text-sm (12px) */}
                            {!isCompact && (
                                <p className="text-white/50 text-sm mt-2 text-center">
                                    {t(`dogs.${dog.translationKey}.description`)}
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
