// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Core Web Vitals monitoring for SEO performance tracking.
 *
 * Extracted from `main.js` in Cycle 28 Stream B1 — observability that
 * runs once at boot and never participates in the per-frame loop. The
 * class itself is unchanged; only the file it lives in changed.
 */

export class WebVitalsMonitor {
    constructor() {
        this.vitals = {
            LCP: null,
            FID: null,
            CLS: null,
            INP: null
        };
        this.observers = [];
        this.initializeWebVitals();
    }

    initializeWebVitals() {
        // Largest Contentful Paint (LCP)
        this.observeLCP();

        // First Input Delay (FID)
        this.observeFID();

        // Cumulative Layout Shift (CLS)
        this.observeCLS();

        // Interaction to Next Paint (INP)
        this.observeINP();

        // Report vitals when page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.reportVitals();
            }
        });
    }

    observeLCP() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.vitals.LCP = Math.round(lastEntry.startTime);
                console.log('[PERF] LCP (Largest Contentful Paint):', this.vitals.LCP + 'ms');
            });
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
            this.observers.push(observer);
        }
    }

    observeFID() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this.vitals.FID = Math.round(entry.processingStart - entry.startTime);
                    console.log('[PERF] FID (First Input Delay):', this.vitals.FID + 'ms');
                });
            });
            observer.observe({ entryTypes: ['first-input'] });
            this.observers.push(observer);
        }
    }

    observeCLS() {
        let clsValue = 0;
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.vitals.CLS = Math.round(clsValue * 10000) / 10000;
                        console.log('[PERF] CLS (Cumulative Layout Shift):', this.vitals.CLS);
                    }
                });
            });
            observer.observe({ entryTypes: ['layout-shift'] });
            this.observers.push(observer);
        }
    }

    observeINP() {
        let interactions = [];
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    const duration = entry.processingEnd - entry.startTime;
                    interactions.push(duration);

                    // Keep only the worst 10 interactions for INP calculation
                    interactions.sort((a, b) => b - a);
                    if (interactions.length > 10) {
                        interactions = interactions.slice(0, 10);
                    }

                    // INP is the 98th percentile (or worst interaction if < 50 interactions)
                    const inp = interactions.length >= 50
                        ? interactions[Math.floor(interactions.length * 0.02)]
                        : interactions[0];

                    this.vitals.INP = Math.round(inp);
                    console.log('[PERF] INP (Interaction to Next Paint):', this.vitals.INP + 'ms');
                });
            });
            observer.observe({ entryTypes: ['event'] });
            this.observers.push(observer);
        }
    }

    reportVitals() {
        console.log('[PERF] Core Web Vitals Summary:', {
            LCP: this.vitals.LCP ? `${this.vitals.LCP}ms ${this.vitals.LCP <= 2500 ? '[OK]' : '[ERROR]'}` : 'Not measured',
            FID: this.vitals.FID ? `${this.vitals.FID}ms ${this.vitals.FID <= 100 ? '[OK]' : '[ERROR]'}` : 'Not measured',
            CLS: this.vitals.CLS ? `${this.vitals.CLS} ${this.vitals.CLS <= 0.1 ? '[OK]' : '[ERROR]'}` : 'Not measured',
            INP: this.vitals.INP ? `${this.vitals.INP}ms ${this.vitals.INP <= 200 ? '[OK]' : '[ERROR]'}` : 'Not measured'
        });

        // Future: Send to analytics service
        // this.sendToAnalytics(this.vitals);
    }

    sendToAnalytics(vitals) {
        // Placeholder for future analytics integration
        // Could send to Google Analytics, custom endpoint, etc.
        console.log('[ANALYTICS] Would send to analytics:', vitals);
    }

    disconnect() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}
