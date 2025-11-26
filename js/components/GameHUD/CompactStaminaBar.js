/**
 * CompactStaminaBar Component
 * Small stamina bar for use within other HUD components
 * Smooth gradient transition: green -> yellow -> orange -> red
 */
const { createElement } = window.React;

// Get stamina color based on percentage (smooth gradient)
function getStaminaColor(stamina) {
    if (stamina >= 60) {
        // Green zone (60-100%)
        return 'linear-gradient(90deg, #10b981, #34d399)';
    } else if (stamina >= 30) {
        // Yellow/Orange zone (30-60%)
        const t = (stamina - 30) / 30; // 0 at 30%, 1 at 60%
        if (t > 0.5) {
            return 'linear-gradient(90deg, #f59e0b, #fbbf24)'; // Yellow
        }
        return 'linear-gradient(90deg, #f97316, #fb923c)'; // Orange
    } else {
        // Red zone (0-30%)
        return 'linear-gradient(90deg, #ef4444, #f87171)';
    }
}

// Get glow color for low stamina warning
function getGlowStyle(stamina) {
    if (stamina < 30) {
        return '0 0 8px rgba(239, 68, 68, 0.5)';
    }
    return 'none';
}

export function CompactStaminaBar({ stamina }) {
    const staminaValue = Math.round(stamina);

    return createElement('div', {
        className: 'mt-3 pt-3 border-t border-white border-opacity-10'
    }, [
        createElement('div', {
            key: 'label',
            className: 'text-white text-xs text-opacity-70 mb-1',
            style: {
                display: 'flex',
                justifyContent: 'space-between'
            }
        }, [
            createElement('span', { key: 'text' }, 'Stamina'),
            createElement('span', {
                key: 'percent',
                style: {
                    color: staminaValue < 30 ? '#f87171' : 'rgba(255, 255, 255, 0.5)'
                }
            }, `${staminaValue}%`)
        ]),
        createElement('div', {
            key: 'bar',
            className: 'h-2 bg-gray-700 rounded-full overflow-hidden',
            style: {
                background: 'rgba(55, 65, 81, 0.5)'
            }
        },
            createElement('div', {
                style: {
                    height: '100%',
                    width: `${staminaValue}%`,
                    background: getStaminaColor(stamina),
                    boxShadow: getGlowStyle(stamina),
                    transition: 'all 0.3s ease-out',
                    borderRadius: '9999px'
                }
            })
        )
    ]);
}
