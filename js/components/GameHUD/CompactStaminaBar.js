/**
 * CompactStaminaBar Component
 * Small stamina bar for use within other HUD components
 */
const { createElement } = window.React;

export function CompactStaminaBar({ stamina }) {
    const isLow = stamina < 30;

    return createElement('div', {
        className: 'mt-3 pt-3 border-t border-white border-opacity-10'
    }, [
        createElement('div', {
            key: 'label',
            className: 'text-white text-xs text-opacity-70 mb-1'
        }, 'Stamina'),
        createElement('div', {
            key: 'bar',
            className: 'h-2 bg-gray-700 rounded-full overflow-hidden'
        },
            createElement('div', {
                className: `h-full transition-all duration-300 ${
                    isLow ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-green-500 to-green-600'
                }`,
                style: { width: `${Math.round(stamina)}%` }
            })
        )
    ]);
}
