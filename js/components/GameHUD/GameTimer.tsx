/**
 * GameTimer — elapsed-time or countdown readout.
 *
 * Cycle 48 P1: converted from the element-factory .js to JSX .tsx. Behavior is
 * identical; the panel chrome is the shared HudPanel. Positioning lives in
 * HudLayout's topRight slot (Cycle 35 Phase 8).
 */
import { useTranslation } from 'react-i18next';
import { HudPanel } from './HudPanel';

interface GameTimerProps {
    gameTime: number;
    timeLimit: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function GameTimer({ gameTime, timeLimit }: GameTimerProps) {
    const { t } = useTranslation();
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60);
    const isTimedMode = timeLimit > 0;
    const timeRemaining = Math.max(0, timeLimit - gameTime);
    const remainingMinutes = Math.floor(timeRemaining / 60);
    const remainingSeconds = Math.floor(timeRemaining % 60);
    const isLowTime = isTimedMode && timeRemaining < 30;

    return (
        <HudPanel className={`py-2 px-4 ${isLowTime ? 'border-red-500/50' : ''}`}>
            {isTimedMode ? (
                <>
                    <div className={`font-mono text-2xl ${isLowTime ? 'text-red-400' : 'text-white'}`}>
                        {pad(remainingMinutes)}:{pad(remainingSeconds)}
                    </div>
                    <div className="text-white/60 text-xs text-center">{t('hud.timeRemaining')}</div>
                </>
            ) : (
                <div className="text-white font-mono text-2xl">
                    {pad(minutes)}:{pad(seconds)}
                </div>
            )}
        </HudPanel>
    );
}
