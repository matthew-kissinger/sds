// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Logger Utility
 * Simple logging with level control and category prefixes
 * Use: Logger.info('GAME', 'Starting...') or just console.log('[GAME] Starting...')
 */

const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

let currentLevel = LogLevel.INFO; // Default to INFO to reduce noise

class Logger {
    static setLevel(level) {
        currentLevel = level;
    }

    static getLevel() {
        return currentLevel;
    }

    static debug(category, message, ...args) {
        if (currentLevel <= LogLevel.DEBUG) {
            console.log(`[${category}] ${message}`, ...args);
        }
    }

    static info(category, message, ...args) {
        if (currentLevel <= LogLevel.INFO) {
            console.log(`[${category}] ${message}`, ...args);
        }
    }

    static warn(category, message, ...args) {
        if (currentLevel <= LogLevel.WARN) {
            console.warn(`[${category}] ${message}`, ...args);
        }
    }

    static error(category, message, ...args) {
        if (currentLevel <= LogLevel.ERROR) {
            console.error(`[${category}] ${message}`, ...args);
        }
    }
}

export { Logger, LogLevel };

if (typeof window !== 'undefined') {
    window.Logger = Logger;
    window.LogLevel = LogLevel;
}
