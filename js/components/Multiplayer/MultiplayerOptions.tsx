/**
 * MultiplayerOptions Component
 * Multiplayer menu - Create, Join, Quick Match
 *
 * Cycle 48 P3: converted from the element-factory .js to token-driven .tsx.
 * The four per-tile accent hexes are now design tokens with the same values:
 * violet-500 -> hueViolet, emerald-500 -> accent, blue-500 -> infoStrong,
 * amber-500 -> staminaAmber. MenuOption blends the accent through its color-mix
 * alpha() helper, so a var() token reads identically to the old raw hex.
 * Behavior is identical to the previous MultiplayerOptions.js.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';
import { color } from '../ui/tokens';

interface MpOption {
    id: string;
    labelKey: string;
    descKey: string;
    color: string;
}

const OPTIONS: MpOption[] = [
    {
        id: 'publicLobbies',
        labelKey: 'multiplayer.publicLobbies',
        descKey: 'multiplayer.publicLobbiesDesc',
        color: color.hueViolet, // Violet
    },
    {
        id: 'create',
        labelKey: 'multiplayer.createRoom',
        descKey: 'multiplayer.createRoomDesc',
        color: color.accent, // Emerald
    },
    {
        id: 'join',
        labelKey: 'multiplayer.joinRoom',
        descKey: 'multiplayer.joinRoomDesc',
        color: color.infoStrong, // Blue
    },
    {
        id: 'quick',
        labelKey: 'multiplayer.quickMatch',
        descKey: 'multiplayer.quickMatchDesc',
        color: color.staminaAmber, // Amber
    },
];

interface MultiplayerOptionsProps {
    onBack: () => void;
    onSelectOption: (id: string) => void;
}

export function MultiplayerOptions({ onBack, onSelectOption }: MultiplayerOptionsProps) {
    const { t } = useTranslation();
    const { isLandscapeMobile } = useResponsive();

    const containerStyle: CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    };

    return (
        <div style={containerStyle}>
            <Panel size="md" maxWidth="28rem" style={{ animation: 'slideUp 0.5s ease-out' }}>
                <PanelTitle>{t('multiplayer.title')}</PanelTitle>

                <MenuOptionGrid>
                    {OPTIONS.map((option) => (
                        <MenuOption
                            key={option.id}
                            label={t(option.labelKey)}
                            description={t(option.descKey)}
                            accentColor={option.color}
                            onClick={() => onSelectOption(option.id)}
                        />
                    ))}
                </MenuOptionGrid>

                <div style={{ marginTop: isLandscapeMobile ? '0.5rem' : '1rem' }}>
                    <BackButton onClick={onBack}>{t('common.back')}</BackButton>
                </div>
            </Panel>
        </div>
    );
}
