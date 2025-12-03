/**
 * SinglePlayerModes Component
 * Mode selection for single player - Classic vs Extreme
 */
import React, { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';

const MODES = [
    {
        id: 'classic',
        labelKey: 'modes.classic',
        descKey: 'modes.classicDesc',
        color: '#10b981' // Emerald
    },
    {
        id: 'extreme',
        labelKey: 'modes.extreme',
        descKey: 'modes.extremeDesc',
        color: '#ef4444' // Red
    }
];

export function SinglePlayerModes({ onSelectMode, onBack }) {
    const { t } = useTranslation();
    const { isLandscapeMobile } = useResponsive();

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    }, createElement(Panel, {
        size: 'md',
        maxWidth: '28rem',
        style: { animation: 'slideUp 0.5s ease-out' }
    }, [
        createElement(PanelTitle, { key: 'title' }, t('modes.title')),

        createElement(MenuOptionGrid, { key: 'modes' },
            MODES.map(mode =>
                createElement(MenuOption, {
                    key: mode.id,
                    label: t(mode.labelKey),
                    description: t(mode.descKey),
                    accentColor: mode.color,
                    onClick: () => onSelectMode(mode.id)
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
