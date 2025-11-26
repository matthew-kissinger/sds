/**
 * DogSelection Component
 * Dog selection grid with stats display
 */
const { createElement } = window.React;

// Dog data with stats
const DOGS = [
    {
        id: 'jep',
        name: 'Jep',
        breed: 'Border Collie',
        description: 'Well-balanced herder with good stamina',
        stats: { speed: 3, stamina: 4, control: 4 }
    },
    {
        id: 'pip',
        name: 'Pip',
        breed: 'Australian Shepherd',
        description: 'Fast and agile, perfect for quick herding',
        stats: { speed: 5, stamina: 3, control: 3 }
    },
    {
        id: 'sally',
        name: 'Sally',
        breed: 'Welsh Corgi',
        description: 'Great control but slower movement',
        stats: { speed: 2, stamina: 4, control: 5 }
    },
    {
        id: 'shiloh',
        name: 'Shiloh',
        breed: 'German Shepherd',
        description: 'Strong and steady with excellent endurance',
        stats: { speed: 3, stamina: 5, control: 3 }
    },
    {
        id: 'george_washington',
        name: 'George Washington',
        breed: 'American Foxhound',
        description: 'Tactical herder with balanced abilities',
        stats: { speed: 3, stamina: 4, control: 3 }
    }
];

function StatBar({ label, value, maxValue = 5 }) {
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
            className: 'flex-1 h-2 bg-gray-700 rounded-full overflow-hidden'
        },
            createElement('div', {
                className: 'h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300',
                style: { width: `${percentage}%` }
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
                className: 'text-left transition-all duration-300',
                style: {
                    background: isSelected
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(28px)',
                    WebkitBackdropFilter: 'blur(28px)',
                    borderRadius: '1rem',
                    border: isSelected
                        ? '2px solid rgba(59, 130, 246, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: isSelected
                        ? '0 4px 20px rgba(59, 130, 246, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)'
                        : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                    padding: '1rem',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                }
            }, [
                // Selection indicator
                isSelected && createElement('div', {
                    key: 'check',
                    className: 'absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center'
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

                // Dog name and breed
                createElement('div', {
                    key: 'header',
                    className: 'relative mb-3'
                }, [
                    createElement('h3', {
                        key: 'name',
                        className: 'text-white font-bold text-lg'
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
                    createElement(StatBar, { key: 'speed', label: 'Speed', value: dog.stats.speed }),
                    createElement(StatBar, { key: 'stamina', label: 'Stamina', value: dog.stats.stamina }),
                    createElement(StatBar, { key: 'control', label: 'Control', value: dog.stats.control })
                ]),

                // Description
                createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-50 text-xs mt-2'
                }, dog.description)
            ]);
        }))
    ]);
}
