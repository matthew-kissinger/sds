/**
 * SheepCounter Component
 * Displays sheep progress with integrated stamina bar
 */
const { createElement } = window.React;
import { CompactStaminaBar } from './CompactStaminaBar.js';

// Sheep icon (simple cloud-like sheep silhouette)
const SheepIcon = ({ size = 24, color = 'currentColor' }) => createElement('svg', {
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

export function SheepCounter({ sheepCount, totalSheep, stamina }) {
    const percentage = Math.round((sheepCount / totalSheep) * 100);

    return createElement('div', {
        className: 'fixed top-6 left-6 z-20',
        style: {
            animation: 'slideDown 0.5s ease-out 0.2s both',
            paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)'
        }
    },
        createElement('div', {
            className: 'ui-panel p-4 min-w-[200px]'
        }, [
            createElement('div', {
                key: 'sheep-progress',
                className: 'flex items-center gap-3'
            }, [
                createElement('div', {
                    key: 'icon',
                    style: { opacity: 0.9 }
                }, createElement(SheepIcon, { size: 28, color: 'rgba(255, 255, 255, 0.85)' })),
                createElement('div', {
                    key: 'info'
                }, [
                    createElement('div', {
                        key: 'count',
                        className: 'text-white font-semibold'
                    }, `${sheepCount} / ${totalSheep}`),
                    createElement('div', {
                        key: 'progress',
                        className: 'text-blue-300 text-xs'
                    }, `${percentage}% complete`)
                ])
            ]),
            createElement(CompactStaminaBar, {
                key: 'stamina',
                stamina: stamina
            })
        ])
    );
}
