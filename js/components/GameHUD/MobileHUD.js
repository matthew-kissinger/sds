/**
 * MobileHUD Component
 * Compact status bar for mobile devices - FIXED at top center with safe area
 */
const { createElement } = window.React;

export function MobileHUD({ gameData, stamina }) {
    const minutes = Math.floor(gameData.gameTime / 60);
    const seconds = Math.floor(gameData.gameTime % 60);

    return createElement('div', {
        className: 'fixed left-1/2 transform -translate-x-1/2 z-20',
        style: {
            // CRITICAL: Use safe-area-inset-top to avoid notch/status bar overlap
            top: 'max(env(safe-area-inset-top, 8px), 8px)',
            animation: 'slideDown 0.5s ease-out'
        }
    },
        createElement('div', {
            className: 'ui-panel p-2 min-w-[180px]'
        }, [
            // Top row: Sheep count and timer
            createElement('div', {
                key: 'top-row',
                className: 'flex items-center gap-4'
            }, [
                // Sheep count
                createElement('div', {
                    key: 'sheep',
                    className: 'flex items-center gap-1'
                }, [
                    createElement('span', { key: 'icon' }, ''),
                    createElement('span', { key: 'count', className: 'text-white text-sm' },
                        `${gameData.sheepCount}/${gameData.totalSheep}`)
                ]),

                // Timer (no decimals)
                createElement('div', {
                    key: 'timer',
                    className: 'flex items-center gap-1'
                }, [
                    createElement('span', { key: 'icon' }, ''),
                    createElement('span', { key: 'time', className: 'text-white font-mono text-sm' },
                        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
                ])
            ]),

            // Minimal stamina bar below
            createElement('div', {
                key: 'stamina-bar',
                className: 'mt-1 h-1 bg-gray-700 bg-opacity-50 rounded-full overflow-hidden'
            },
                createElement('div', {
                    className: `h-full transition-all duration-300 ${
                        stamina < 30 ? 'bg-red-500' : 'bg-green-500'
                    }`,
                    style: { width: `${stamina}%` }
                })
            )
        ])
    );
}
