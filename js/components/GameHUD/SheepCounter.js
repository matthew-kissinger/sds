/**
 * SheepCounter Component
 * Displays sheep progress with integrated stamina bar
 */
const { createElement } = window.React;
import { CompactStaminaBar } from './CompactStaminaBar.js';

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
                createElement('span', {
                    key: 'icon',
                    className: 'text-2xl'
                }, ''),
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
