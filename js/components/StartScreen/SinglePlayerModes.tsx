/**
 * SinglePlayerModes Component
 * Mode selection for single player difficulties:
 * Practice (30 sheep, no leaderboard), Classic (200), Extreme (1000),
 * Insane (3000), Chaos (5000).
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * The per-mode accent hex literals now read the design-token palette (cyan,
 * accent/emerald, danger/red, purple, stamina-amber). Behavior is identical.
 */
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption';
import { BackButton } from '../ui/Button';
import { color } from '../ui/tokens';

interface ModeDef {
    id: string;
    labelKey: string;
    descKey: string;
    color: string;
}

const MODES: ModeDef[] = [
    {
        // Cycle 26 v2.1.0: no-pressure entry mode. Position 0 so first-time
        // visitors see it first; pulses on first visit (see hasPlayed check
        // below).
        id: 'practice',
        labelKey: 'modes.practice',
        descKey: 'modes.practiceDesc',
        color: color.hueCyan, // Cyan-500, distinct from emerald (Classic)
    },
    {
        id: 'classic',
        labelKey: 'modes.classic',
        descKey: 'modes.classicDesc',
        color: color.accent, // Emerald
    },
    {
        id: 'extreme',
        labelKey: 'modes.extreme',
        descKey: 'modes.extremeDesc',
        color: color.danger, // Red
    },
    {
        id: 'insane',
        labelKey: 'modes.insane',
        descKey: 'modes.insaneDesc',
        color: color.huePurple, // Purple
    },
    {
        id: 'chaos',
        labelKey: 'modes.chaos',
        descKey: 'modes.chaosDesc',
        color: color.staminaAmber, // Amber/Orange
    },
];

// First-visit detection: pulses the Practice tile until the player starts
// any solo mode (GameState.startGame sets the flag). Read via try/catch so
// SSR / privacy-mode browsers without localStorage don't hard-error.
function hasPlayed(): boolean {
    try {
        return localStorage.getItem('sds.has-played') === '1';
    } catch {
        return false;
    }
}

interface SinglePlayerModesProps {
    onSelectMode: (modeId: string) => void;
    onBack: () => void;
}

export function SinglePlayerModes({ onSelectMode, onBack }: SinglePlayerModesProps) {
    const { t } = useTranslation();
    const { isLandscapeMobile } = useResponsive();
    const showPracticeNudge = !hasPlayed();

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
            }}
        >
            <Panel size="md" maxWidth="28rem" style={{ animation: 'slideUp 0.5s ease-out' }}>
                <PanelTitle>{t('modes.title')}</PanelTitle>

                <MenuOptionGrid>
                    {MODES.map((mode) => {
                        const tile = (
                            <MenuOption
                                key={mode.id}
                                label={t(mode.labelKey)}
                                description={t(mode.descKey)}
                                accentColor={mode.color}
                                onClick={() => onSelectMode(mode.id)}
                            />
                        );
                        if (mode.id === 'practice' && showPracticeNudge) {
                            return (
                                <div key="practice-wrap" className="practice-pulse-wrapper">
                                    {tile}
                                </div>
                            );
                        }
                        return tile;
                    })}
                </MenuOptionGrid>

                <div style={{ marginTop: isLandscapeMobile ? '0.5rem' : '1rem' }}>
                    <BackButton onClick={onBack}>{t('common.back')}</BackButton>
                </div>
            </Panel>
        </div>
    );
}
