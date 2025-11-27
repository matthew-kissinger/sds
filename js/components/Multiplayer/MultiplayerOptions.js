/**
 * MultiplayerOptions Component
 * Multiplayer menu - Create, Join, Quick Match
 */
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';

const { createElement } = window.React;

const OPTIONS = [
    {
        id: 'create',
        label: 'Create Room',
        description: 'Host a new game room',
        color: '#10b981' // Emerald
    },
    {
        id: 'join',
        label: 'Join Room',
        description: 'Enter a room code',
        color: '#3b82f6' // Blue
    },
    {
        id: 'quick',
        label: 'Quick Match',
        description: 'Find an available game',
        color: '#f59e0b' // Amber
    }
];

export function MultiplayerOptions({ onBack, onSelectOption }) {
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
        createElement(PanelTitle, { key: 'title' }, 'Multiplayer'),

        createElement(MenuOptionGrid, { key: 'options' },
            OPTIONS.map(option =>
                createElement(MenuOption, {
                    key: option.id,
                    label: option.label,
                    description: option.description,
                    accentColor: option.color,
                    onClick: () => onSelectOption(option.id)
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
