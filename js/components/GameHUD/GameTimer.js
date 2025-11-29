/**
 * GameTimer Component
 * Displays elapsed time or countdown timer
 */
import React, { createElement } from 'react';

export function GameTimer({ gameTime, timeLimit }) {
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60);
    const isTimedMode = timeLimit > 0;
    const timeRemaining = Math.max(0, timeLimit - gameTime);
    const remainingMinutes = Math.floor(timeRemaining / 60);
    const remainingSeconds = Math.floor(timeRemaining % 60);
    const isLowTime = isTimedMode && timeRemaining < 30;

    return createElement('div', {
        className: 'fixed top-6 right-6 z-20 animate-slide-down',
        style: { paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)' }
    },
        createElement('div', {
            className: `ui-panel py-2 px-4 ${isLowTime ? 'border-red-500/50' : ''}`
        },
            isTimedMode ? [
                createElement('div', {
                    key: 'timed',
                    className: `font-mono text-2xl ${isLowTime ? 'text-red-400' : 'text-white'}`
                }, `${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`),
                createElement('div', {
                    key: 'label',
                    className: 'text-white/60 text-xs text-center'
                }, 'Time Remaining')
            ] : createElement('div', {
                className: 'text-white font-mono text-2xl'
            }, `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
        )
    );
}
