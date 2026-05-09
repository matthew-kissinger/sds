/**
 * Score storage helpers extracted from `main.js` in Cycle 28 Stream B1.
 *
 * Pure utilities — no Three.js, no DOM beyond `localStorage`. The
 * SheepDogSimulation class wraps each as a thin shim method to preserve
 * the public method names (formatTime / loadBestScore / saveBestScore /
 * saveTimedModeScore / getBestScoreText / updateBestScoreDisplay) that
 * other modules + the timed-mode UI rely on.
 */

const KEY = 'timedModeBestScore';

/**
 * Format seconds → "M:SS" string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Read the timed-mode best score from localStorage. Returns null if
 * unset, unparseable, or storage is unavailable (private browsing,
 * Safari quota errors, etc.).
 *
 * @returns {number | null}
 */
export function loadBestScore() {
    try {
        const savedScore = localStorage.getItem(KEY);
        return savedScore ? parseInt(savedScore) : null;
    } catch (e) {
        console.warn('Could not load best score from localStorage:', e);
        return null;
    }
}

/**
 * Persist a new best score if it beats the current. Returns true on
 * new record, false otherwise. Swallows storage errors.
 *
 * @param {number} score
 * @returns {boolean}
 */
export function saveBestScore(score) {
    try {
        const currentBest = loadBestScore();
        if (currentBest === null || score > currentBest) {
            localStorage.setItem(KEY, score.toString());
            return true;
        }
        return false;
    } catch (e) {
        console.warn('Could not save best score to localStorage:', e);
        return false;
    }
}

/**
 * Same as saveBestScore but with the timed-mode console log on new
 * records. Kept distinct because the original main.js logged here.
 *
 * @param {number} score
 * @returns {boolean}
 */
export function saveTimedModeScore(score) {
    try {
        const currentBest = loadBestScore();
        if (currentBest === null || score > currentBest) {
            localStorage.setItem(KEY, score.toString());
            console.log(`[GAME] New timed mode best score: ${score} sheep!`);
            return true;
        }
        return false;
    } catch (e) {
        console.warn('Could not save best score to localStorage:', e);
        return false;
    }
}

/**
 * Render the "Best: N sheep" / "Best: --" text for the timed-mode
 * leaderboard chip.
 *
 * @returns {string}
 */
export function getBestScoreText() {
    const bestScore = loadBestScore();
    return bestScore !== null ? `Best: ${bestScore} sheep` : 'Best: --';
}
