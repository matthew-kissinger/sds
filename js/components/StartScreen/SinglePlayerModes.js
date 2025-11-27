/**
 * SinglePlayerModes Component
 * Mode selection for single player - Classic vs Extreme
 */
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';

const { createElement } = window.React;

const MODES = [
    {
        id: 'classic',
        label: 'Classic Mode',
        description: 'Herd all 200 sheep to the pasture',
        color: '#10b981' // Emerald
    },
    {
        id: 'extreme',
        label: 'Extreme Mode',
        description: 'Herd all 1000 sheep - performance challenge!',
        color: '#ef4444' // Red
    }
];

export function SinglePlayerModes({ onSelectMode, onBack }) {
    const { isLandscapeMobile } = useResponsive();

    return createElement('div', {
        style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%'
        }
    }, createElement(Panel, {
        size: 'md',
        maxWidth: '28rem',
        style: { animation: 'slideUp 0.5s ease-out' }
    }, [
        createElement(PanelTitle, { key: 'title' }, 'Choose Game Mode'),

        createElement(MenuOptionGrid, { key: 'modes' },
            MODES.map(mode =>
                createElement(MenuOption, {
                    key: mode.id,
                    label: mode.label,
                    description: mode.description,
                    accentColor: mode.color,
                    onClick: () => onSelectMode(mode.id)
                })
            )
        ),

        createElement('div', {
            key: 'back',
            style: { marginTop: isLandscapeMobile ? '0.5rem' : '1rem' }
        },
            createElement(BackButton, { onClick: onBack }, 'Back')
        )
    ]));
}
