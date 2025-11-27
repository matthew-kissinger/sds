/**
 * MobileHUD Component
 * Compact status bar for mobile devices - FIXED at top center with safe area
 */
const { createElement } = window.React;

// Sheep icon (simple cloud-like sheep silhouette)
const SheepIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color,
    stroke: 'none'
}, [
    // Body (fluffy cloud shape)
    createElement('ellipse', { key: 'body', cx: '12', cy: '14', rx: '8', ry: '5' }),
    // Head
    createElement('circle', { key: 'head', cx: '18', cy: '12', r: '3' }),
    // Legs
    createElement('rect', { key: 'leg1', x: '7', y: '17', width: '2', height: '4', rx: '1' }),
    createElement('rect', { key: 'leg2', x: '11', y: '17', width: '2', height: '4', rx: '1' }),
    createElement('rect', { key: 'leg3', x: '15', y: '17', width: '2', height: '4', rx: '1' })
]);

// Get stamina color based on percentage (smooth gradient)
function getStaminaColor(stamina) {
    if (stamina >= 60) {
        return 'linear-gradient(90deg, #10b981, #34d399)';
    } else if (stamina >= 30) {
        const t = (stamina - 30) / 30;
        if (t > 0.5) {
            return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        }
        return 'linear-gradient(90deg, #f97316, #fb923c)';
    }
    return 'linear-gradient(90deg, #ef4444, #f87171)';
}

// Clock icon (Lucide-style)
const ClockIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('circle', { key: 'face', cx: '12', cy: '12', r: '10' }),
    createElement('polyline', { key: 'hands', points: '12 6 12 12 16 14' })
]);

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
                    createElement(SheepIcon, { key: 'icon', size: 16, color: 'rgba(255, 255, 255, 0.8)' }),
                    createElement('span', { key: 'count', className: 'text-white text-sm' },
                        `${gameData.sheepCount}/${gameData.totalSheep}`)
                ]),

                // Timer (no decimals)
                createElement('div', {
                    key: 'timer',
                    className: 'flex items-center gap-1'
                }, [
                    createElement(ClockIcon, { key: 'icon', size: 14, color: 'rgba(255, 255, 255, 0.8)' }),
                    createElement('span', { key: 'time', className: 'text-white font-mono text-sm' },
                        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
                ])
            ]),

            // Minimal stamina bar below with smooth color gradient
            createElement('div', {
                key: 'stamina-bar',
                className: 'mt-1 h-1 rounded-full overflow-hidden',
                style: { background: 'rgba(55, 65, 81, 0.5)' }
            },
                createElement('div', {
                    style: {
                        height: '100%',
                        width: `${stamina}%`,
                        background: getStaminaColor(stamina),
                        boxShadow: stamina < 30 ? '0 0 6px rgba(239, 68, 68, 0.5)' : 'none',
                        transition: 'all 0.3s ease-out',
                        borderRadius: '9999px'
                    }
                })
            )
        ])
    );
}
