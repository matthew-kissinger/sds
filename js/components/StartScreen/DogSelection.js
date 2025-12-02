/**
 * DogSelection Component
 * Dog selection grid with stats display and visual avatars
 * Responsive: adapts to mobile portrait and landscape
 *
 * Dog icon: "Sitting Dog" by Delapouite from game-icons.net (CC BY 3.0)
 */
import React, { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { PanelTitle } from '../ui/Panel.js';

// Dog avatar using game-icons.net sitting dog icon
const DogAvatar = ({ color = '#3b82f6', size = 48 }) => createElement('div', {
    style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}22`,
        borderRadius: '12px',
        padding: '6px'
    }
}, createElement('svg', {
    width: size - 12,
    height: size - 12,
    viewBox: '0 0 512 512',
    fill: color
}, createElement('path', {
    d: 'm231.6 16.18 16.7 120.02 73.8 20.5c37.3-11.2 78.5-18.2 102.3-43.6 9.7-10.3 17.2-24.78 9.1-37.92l-75.3 2.22-14.6-31.79h-74.7c-7.7-11.71-22.8-20.46-37.3-29.43zm5.7 145.22c-46.9 19.8-110.1 146.3-111.8 276.5-34.02-58.1-24.9-122.6-2.9-202.6C55.31 287 4.732 448.4 133.1 486.9H346s-6.3-21.5-14.1-28.9c-12.7-12-48.2-20.2-48.2-20.2 27.8-39.2 33.5-71.7 38.6-103.9 4.5 59.8 40.7 126.8 57.4 153h76.5s4.6-15.9.2-21.5c-10.9-13.8-51.3-11.9-51.3-11.9-31.1-107.2-46.3-260.2-90-273.2-21.7-6.5-54.3-14.1-77.8-18.9z'
})));

// Dog data with stats and avatar colors - using translation keys
const DOGS = [
    {
        id: 'jep',
        translationKey: 'jep',
        stats: { speed: 3, stamina: 4, control: 4 },
        color: '#3b82f6'
    },
    {
        id: 'pip',
        translationKey: 'pip',
        stats: { speed: 5, stamina: 3, control: 3 },
        color: '#f59e0b'
    },
    {
        id: 'sally',
        translationKey: 'sally',
        stats: { speed: 2, stamina: 4, control: 5 },
        color: '#ec4899'
    },
    {
        id: 'shiloh',
        translationKey: 'shiloh',
        stats: { speed: 3, stamina: 5, control: 3 },
        color: '#10b981'
    },
    {
        id: 'george_washington',
        translationKey: 'georgeWashington',
        stats: { speed: 3, stamina: 4, control: 3 },
        color: '#8b5cf6'
    }
];

/**
 * StatBar - Dog stat visualization
 * Type scale: text-xs (10px) for labels/values, consistent with type system
 */
function StatBar({ label, value, maxValue = 5, color = '#3b82f6', isCompact = false }) {
    const percentage = (value / maxValue) * 100;

    // Use type scale: text-xs for compact, text-sm for normal
    const textClass = isCompact ? 'text-xs' : 'text-sm';
    const labelWidth = isCompact ? 'w-10' : 'w-16';
    const barHeight = isCompact ? 'h-1' : 'h-2';
    const marginClass = isCompact ? 'mb-0.5' : 'mb-1';

    return createElement('div', {
        className: `flex items-center gap-2 ${marginClass}`
    }, [
        createElement('span', {
            key: 'label',
            className: `${textClass} text-white/70 ${labelWidth}`
        }, label),
        createElement('div', {
            key: 'bar',
            className: `flex-1 ${barHeight} rounded-full overflow-hidden bg-gray-700/50`
        },
            createElement('div', {
                className: 'h-full rounded-full transition-all duration-300',
                style: {
                    width: `${percentage}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}dd)`
                }
            })
        ),
        createElement('span', {
            key: 'value',
            className: `${textClass} text-white/80 w-4 text-right`
        }, value)
    ]);
}

export function DogSelection({ selectedDog, onSelect }) {
    const { t } = useTranslation();
    const { isCompact, isLandscapeMobile, isVeryCompact } = useResponsive();

    // Responsive grid: 5 cols desktop, 2 cols mobile portrait, 5 cols landscape
    const gridColsClass = isLandscapeMobile ? 'grid-cols-5' : isCompact ? 'grid-cols-2' : 'grid-cols-5';
    const gapClass = isCompact ? 'gap-1.5' : 'gap-4';
    const maxWidthClass = isCompact ? 'max-w-[calc(100vw-2rem)]' : 'max-w-4xl';

    const avatarSize = isCompact ? 40 : 56;
    const paddingClass = isCompact ? 'p-2' : 'p-4';
    const radiusClass = isCompact ? 'rounded-xl' : 'rounded-2xl';

    return createElement('div', {
        className: `w-full mx-auto ${maxWidthClass} animate-slide-up`
    }, [
        createElement(PanelTitle, { key: 'title' }, t('dogs.title')),

        createElement('div', {
            key: 'grid',
            className: `grid ${gridColsClass} ${gapClass}`
        }, DOGS.map(dog => {
            const isSelected = selectedDog === dog.id;

            // Card classes - mostly Tailwind, dynamic colors via style
            const cardClasses = `
                ${paddingClass} ${radiusClass}
                text-left cursor-pointer
                backdrop-blur-xl
                transition-all duration-300
                ${isSelected ? 'scale-[1.02]' : 'scale-100'}
            `.trim().replace(/\s+/g, ' ');

            return createElement('button', {
                key: dog.id,
                onClick: () => onSelect(dog.id),
                className: cardClasses,
                style: {
                    background: isSelected
                        ? `linear-gradient(135deg, ${dog.color}22, ${dog.color}11)`
                        : 'rgba(255, 255, 255, 0.08)',
                    border: isSelected
                        ? `2px solid ${dog.color}88`
                        : '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: isSelected
                        ? `0 4px 20px ${dog.color}33`
                        : '0 4px 16px rgba(0, 0, 0, 0.1)'
                }
            }, [
                // Selection indicator
                isSelected && createElement('div', {
                    key: 'check',
                    className: `absolute ${isCompact ? 'top-1 right-1 w-[18px] h-[18px]' : 'top-2 right-2 w-6 h-6'} rounded-full flex items-center justify-center`,
                    style: {
                        background: dog.color,
                        boxShadow: `0 2px 8px ${dog.color}66`
                    }
                },
                    createElement('svg', {
                        width: isCompact ? '10' : '14',
                        height: isCompact ? '10' : '14',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'white',
                        strokeWidth: '3',
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                    },
                        createElement('polyline', { points: '20 6 9 17 4 12' })
                    )
                ),

                // Dog avatar - hide on very compact
                !isVeryCompact && createElement('div', {
                    key: 'avatar',
                    className: `flex justify-center ${isCompact ? 'mb-1.5' : 'mb-3'} ${isSelected ? 'opacity-100' : 'opacity-80'} transition-opacity duration-300`
                }, createElement(DogAvatar, { color: dog.color, size: avatarSize })),

                // Dog name and breed - using type scale
                createElement('div', {
                    key: 'header',
                    className: `relative ${isCompact ? 'mb-1' : 'mb-3'} text-center`
                }, [
                    // Name: text-base (14px) compact, text-lg (20px) normal
                    createElement('h3', {
                        key: 'name',
                        className: `font-bold truncate ${isCompact ? 'text-base' : 'text-lg'}`,
                        style: { color: isSelected ? dog.color : '#fff' }
                    }, t(`dogs.${dog.translationKey}.name`)),
                    // Breed: text-xs (10px) compact, text-sm (12px) normal
                    !isVeryCompact && createElement('p', {
                        key: 'breed',
                        className: `text-white/60 ${isCompact ? 'text-xs' : 'text-sm'}`
                    }, t(`dogs.${dog.translationKey}.breed`))
                ]),

                // Stats - hide on very compact
                !isVeryCompact && createElement('div', {
                    key: 'stats'
                }, [
                    createElement(StatBar, { key: 'speed', label: t('dogs.stats.speed'), value: dog.stats.speed, color: dog.color, isCompact }),
                    createElement(StatBar, { key: 'stamina', label: t('dogs.stats.stamina'), value: dog.stats.stamina, color: dog.color, isCompact }),
                    createElement(StatBar, { key: 'control', label: t('dogs.stats.control'), value: dog.stats.control, color: dog.color, isCompact })
                ]),

                // Description - hide on compact. Type scale: text-sm (12px)
                !isCompact && createElement('p', {
                    key: 'desc',
                    className: 'text-white/50 text-sm mt-2 text-center'
                }, t(`dogs.${dog.translationKey}.description`))
            ]);
        }))
    ]);
}
