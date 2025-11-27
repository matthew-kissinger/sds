/**
 * DogSelection Component
 * Dog selection grid with stats display and visual avatars
 *
 * Dog icon: "Sitting Dog" by Delapouite from game-icons.net (CC BY 3.0)
 */
const { createElement } = window.React;

// Dog avatar using game-icons.net sitting dog icon (inline SVG for color control)
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

// Dog data with stats and avatar colors
const DOGS = [
    {
        id: 'jep',
        name: 'Jep',
        breed: 'Border Collie',
        description: 'Well-balanced herder with good stamina',
        stats: { speed: 3, stamina: 4, control: 4 },
        color: '#3b82f6' // Blue
    },
    {
        id: 'pip',
        name: 'Pip',
        breed: 'Australian Shepherd',
        description: 'Fast and agile, perfect for quick herding',
        stats: { speed: 5, stamina: 3, control: 3 },
        color: '#f59e0b' // Amber
    },
    {
        id: 'sally',
        name: 'Sally',
        breed: 'Welsh Corgi',
        description: 'Great control but slower movement',
        stats: { speed: 2, stamina: 4, control: 5 },
        color: '#ec4899' // Pink
    },
    {
        id: 'shiloh',
        name: 'Shiloh',
        breed: 'German Shepherd',
        description: 'Strong and steady with excellent endurance',
        stats: { speed: 3, stamina: 5, control: 3 },
        color: '#10b981' // Emerald
    },
    {
        id: 'george_washington',
        name: 'George Washington',
        breed: 'American Foxhound',
        description: 'Tactical herder with balanced abilities',
        stats: { speed: 3, stamina: 4, control: 3 },
        color: '#8b5cf6' // Purple
    }
];

function StatBar({ label, value, maxValue = 5, color = '#3b82f6' }) {
    const percentage = (value / maxValue) * 100;

    return createElement('div', {
        className: 'flex items-center gap-2 mb-1'
    }, [
        createElement('span', {
            key: 'label',
            className: 'text-white text-opacity-70 text-xs w-16'
        }, label),
        createElement('div', {
            key: 'bar',
            className: 'flex-1 h-2 rounded-full overflow-hidden',
            style: { background: 'rgba(55, 65, 81, 0.5)' }
        },
            createElement('div', {
                style: {
                    height: '100%',
                    width: `${percentage}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                    transition: 'all 0.3s ease-out',
                    borderRadius: '9999px'
                }
            })
        ),
        createElement('span', {
            key: 'value',
            className: 'text-white text-opacity-80 text-xs w-4 text-right'
        }, value)
    ]);
}

export function DogSelection({ selectedDog, onSelect }) {
    return createElement('div', {
        className: 'w-full',
        style: { animation: 'slideUp 0.6s ease-out' }
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-6',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Choose Your Dog'),

        createElement('div', {
            key: 'grid',
            className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4'
        }, DOGS.map(dog => {
            const isSelected = selectedDog === dog.id;

            return createElement('button', {
                key: dog.id,
                onClick: () => onSelect(dog.id),
                className: 'text-left transition-all duration-300 relative',
                style: {
                    background: isSelected
                        ? `linear-gradient(135deg, ${dog.color}22, ${dog.color}11)`
                        : 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(28px)',
                    WebkitBackdropFilter: 'blur(28px)',
                    borderRadius: '1rem',
                    border: isSelected
                        ? `2px solid ${dog.color}88`
                        : '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: isSelected
                        ? `0 4px 20px ${dog.color}33, inset 0 1px 0 0 rgba(255, 255, 255, 0.1)`
                        : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                    padding: '1rem',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                }
            }, [
                // Selection indicator
                isSelected && createElement('div', {
                    key: 'check',
                    style: {
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '24px',
                        height: '24px',
                        background: dog.color,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 2px 8px ${dog.color}66`
                    }
                },
                    createElement('svg', {
                        width: '14',
                        height: '14',
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

                // Dog avatar
                createElement('div', {
                    key: 'avatar',
                    style: {
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: '12px',
                        opacity: isSelected ? 1 : 0.8,
                        transition: 'opacity 0.3s ease'
                    }
                }, createElement(DogAvatar, { color: dog.color, size: 56 })),

                // Dog name and breed
                createElement('div', {
                    key: 'header',
                    className: 'relative mb-3 text-center'
                }, [
                    createElement('h3', {
                        key: 'name',
                        className: 'text-white font-bold text-lg',
                        style: { color: isSelected ? dog.color : '#fff' }
                    }, dog.name),
                    createElement('p', {
                        key: 'breed',
                        className: 'text-white text-opacity-60 text-xs'
                    }, dog.breed)
                ]),

                // Stats
                createElement('div', {
                    key: 'stats',
                    className: 'space-y-1'
                }, [
                    createElement(StatBar, { key: 'speed', label: 'Speed', value: dog.stats.speed, color: dog.color }),
                    createElement(StatBar, { key: 'stamina', label: 'Stamina', value: dog.stats.stamina, color: dog.color }),
                    createElement(StatBar, { key: 'control', label: 'Control', value: dog.stats.control, color: dog.color })
                ]),

                // Description
                createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-50 text-xs mt-2 text-center'
                }, dog.description)
            ]);
        }))
    ]);
}
