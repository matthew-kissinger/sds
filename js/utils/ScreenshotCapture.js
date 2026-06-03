// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ScreenshotCapture - Utility for capturing game screenshots
 * Press F12 to capture a screenshot, or call window.captureScreenshot()
 */

class ScreenshotCapture {
    constructor() {
        this.canvas = null;
        this.setupKeyboardShortcut();
        console.log('[SCREENSHOT] Screenshot capture ready. Press F12 or call window.captureScreenshot()');
    }

    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F12' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                this.capture();
            }
        });
    }

    findCanvas() {
        // Find the Three.js canvas
        const canvas = document.querySelector('#canvas-container canvas');
        if (canvas) return canvas;

        // Fallback to any canvas
        return document.querySelector('canvas');
    }

    async capture(filename = null) {
        const canvas = this.findCanvas();
        if (!canvas) {
            console.error('[SCREENSHOT] No canvas found');
            return null;
        }

        try {
            // Get the canvas data
            const dataUrl = canvas.toDataURL('image/png');

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const name = filename || `sheepdogsim-screenshot-${timestamp}.png`;

            // Create download link
            const link = document.createElement('a');
            link.download = name;
            link.href = dataUrl;
            link.click();

            console.log(`[SCREENSHOT] Captured: ${name}`);
            return dataUrl;
        } catch (error) {
            console.error('[SCREENSHOT] Capture failed:', error);
            return null;
        }
    }

    /**
     * Capture full page including UI overlay
     * Uses html2canvas if available, falls back to canvas only
     */
    async captureFullPage(filename = null) {
        // Check if html2canvas is available
        if (typeof html2canvas !== 'undefined') {
            try {
                const canvas = await html2canvas(document.body, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const name = filename || `sheepdogsim-fullpage-${timestamp}.png`;

                const link = document.createElement('a');
                link.download = name;
                link.href = canvas.toDataURL('image/png');
                link.click();

                console.log(`[SCREENSHOT] Full page captured: ${name}`);
                return canvas.toDataURL('image/png');
            } catch (error) {
                console.error('[SCREENSHOT] Full page capture failed:', error);
            }
        }

        // Fallback to canvas only
        return this.capture(filename);
    }
}

// Initialize and expose globally
const screenshotCapture = new ScreenshotCapture();
window.captureScreenshot = () => screenshotCapture.capture();
window.captureFullPage = () => screenshotCapture.captureFullPage();

export { ScreenshotCapture, screenshotCapture };
