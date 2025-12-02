/**
 * MultiplayerOptions Component
 * Multiplayer menu - Create, Join, Quick Match
 */
import React, { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';

const OPTIONS = [
    {
        id: 'create',
        labelKey: 'multiplayer.createRoom',
        descKey: 'multiplayer.createRoomDesc',
        color: '#10b981' // Emerald
    },
    {
        id: 'join',
        labelKey: 'multiplayer.joinRoom',
        descKey: 'multiplayer.joinRoomDesc',
        color: '#3b82f6' // Blue
    },
    {
        id: 'quick',
        labelKey: 'multiplayer.quickMatch',
        descKey: 'multiplayer.quickMatchDesc',
        color: '#f59e0b' // Amber
    }
];

export function MultiplayerOptions({ onBack, onSelectOption }) {
    const { t } = useTranslation();
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
        createElement(PanelTitle, { key: 'title' }, t('multiplayer.title')),

        createElement(MenuOptionGrid, { key: 'options' },
            OPTIONS.map(option =>
                createElement(MenuOption, {
                    key: option.id,
                    label: t(option.labelKey),
                    description: t(option.descKey),
                    accentColor: option.color,
                    onClick: () => onSelectOption(option.id)
                })
            )
        ),

        createElement('div', {
            key: 'back',
            style: { marginTop: isLandscapeMobile ? '0.5rem' : '1rem' }
        },
            createElement(BackButton, { onClick: onBack }, t('common.back'))
        )
    ]));
}
