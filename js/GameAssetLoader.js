// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { getSceneManager } from './GameBridge.js';
import { TIER_PRESETS } from './HardwareTier.js';

/**
 * Progressive Asset Loader for SEO performance optimization
 * Prioritizes critical game assets and defers non-critical ones using requestIdleCallback
 */
export class GameAssetLoader {
    constructor() {
        this.criticalAssets = [];
        this.deferredAssets = [];
        this.loadedAssets = new Set();
        this.loadingPromises = new Map();
        this.isLoadingCritical = false;
        this.isDeferredLoadingStarted = false;

        // Detect iOS - audio preloading doesn't work without user interaction
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        console.log(`[ASSET] GameAssetLoader initialized (iOS=${this.isIOS})`);
    }

    /**
     * Define critical assets that must load first for core gameplay
     */
    defineCriticalAssets() {
        // Cycle 91 Phase 5: only what the first playable frame actually
        // needs gates isInitialized - the default dog, the dominant tree,
        // the near rock. Sally/Pip/Shiloh moved to deferred (the dog picker
        // loads the chosen GLB at Play commit; the deferred warm just makes
        // that a cache hit), the dead PolyArt_Dogs_color.png preload is gone
        // (no live material references it), and audio rides deferred where
        // it never gated init anyway.
        return [
            'assets/models/Jep.glb',

            // Critical terrain models
            'assets/models/trees/tree1.glb',
            'assets/models/rocks/rock1.glb'
        ];
    }

    /**
     * Define deferred assets that can load during idle time
     */
    defineDeferredAssets() {
        // Cycle 91 Phase 5: LOD1 tree GLBs warm the cache only on tiers that
        // place them (usesLod1ForFoliage = low). TerrainBuilder.loadModels
        // carries the matching gate, so on desktop neither path fetches them.
        const tier = getSceneManager()?.getTier?.() ?? 'med';
        const wantsLod1 = (TIER_PRESETS[tier] ?? TIER_PRESETS.med).usesLod1ForFoliage === true;
        return [
            // Remaining dog models (the picker's choice loads at Play commit;
            // this idle warm makes it a cache hit)
            'assets/models/Sally.glb',
            'assets/models/Pip.glb',
            'assets/models/Shiloh.glb',
            'assets/models/George_Washington.glb',

            // Fence and gate kit (one shared-texture GLB for all four pieces)
            'assets/models/Fence_Kit-v1.0.0.glb',

            // Environment details (Cycle 91 Phase 6: Mountain_Group preloads
            // removed with the dead mountain model loads)
            'assets/models/Farm house.glb',
            'assets/models/trees/tree2.glb',
            'assets/models/rocks/rock2.glb',
            'assets/models/rocks/rock3.glb',

            // Cycle 22 Phase A / Cycle 91 Phase 5: meshopt-baked LOD1,
            // tier-gated (see above).
            ...(wantsLod1 ? [
                'assets/models/trees/tree1_lod1.glb',
                'assets/models/trees/tree2_lod1.glb',
            ] : []),

            // Essential UI sounds (deferred since Cycle 91 Phase 5 - they
            // never gated init and the click sound loads in well under the
            // first interaction)
            'assets/sounds_compressed/ui_click.mp3',
            'assets/sounds_compressed/dog_bark_jep.mp3',

            // Additional audio files
            'assets/sounds_compressed/music_start.mp3',
            'assets/sounds_compressed/music_gameplay_1.mp3',
            'assets/sounds_compressed/music_gameplay_2.mp3',
            'assets/sounds_compressed/music_gameplay_3.mp3',
            'assets/sounds_compressed/music_competitive_1.mp3',
            'assets/sounds_compressed/music_competitive_2.mp3',
            'assets/sounds_compressed/music_competitive_endgame.mp3',
            'assets/sounds_compressed/music_victory.mp3',
            'assets/sounds_compressed/dog_bark_pip.mp3',
            'assets/sounds_compressed/sheep_bleat_agitated.mp3',
            'assets/sounds_compressed/sheep_bleat_cartoon.mp3',
            'assets/sounds_compressed/sheep_bleat_cheerful.mp3',
            'assets/sounds_compressed/sheep_bleat_short.mp3',
            'assets/sounds_compressed/effect_lose.mp3',
            'assets/sounds_compressed/effect_opponent_score.mp3',
            'assets/sounds_compressed/effect_score.mp3',
            'assets/sounds_compressed/rewarding_chime.mp3'
        ];
    }

    /**
     * Load critical assets first for immediate gameplay readiness
     */
    async loadCriticalAssets() {
        this.isLoadingCritical = true;
        this.criticalAssets = this.defineCriticalAssets();
        
        console.log('[ASSET] Loading critical assets for immediate gameplay...', {
            count: this.criticalAssets.length,
            assets: this.criticalAssets
        });

        const startTime = performance.now();
        
        try {
            // Load critical assets in parallel but track them
            const loadPromises = this.criticalAssets.map(async (assetPath) => {
                try {
                    await this.loadSingleAsset(assetPath, true);
                    console.log(`[ASSET] Critical asset loaded: ${assetPath}`);
                } catch (error) {
                    console.warn(`[WARN] Failed to load critical asset: ${assetPath}`, error);
                    // Don't fail the whole batch for one asset
                }
            });

            await Promise.all(loadPromises);
            
            const loadTime = performance.now() - startTime;
            console.log(`[ASSET] Critical assets loaded in ${Math.round(loadTime)}ms`);
            
            // Start deferred loading after critical assets are done
            this.startDeferredLoading();
            
        } catch (error) {
            console.error('[ERROR] Critical asset loading failed:', error);
        } finally {
            this.isLoadingCritical = false;
        }
    }

    /**
     * Start loading deferred assets using requestIdleCallback
     */
    startDeferredLoading() {
        if (this.isDeferredLoadingStarted) return;
        
        this.isDeferredLoadingStarted = true;
        this.deferredAssets = this.defineDeferredAssets();
        
        console.log('[ASSET] Starting deferred asset loading during idle time...', {
            count: this.deferredAssets.length
        });

        // Use requestIdleCallback for non-blocking deferred loading
        if ('requestIdleCallback' in window) {
            this.loadDeferredBatch();
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => this.loadDeferredBatch(), 100);
        }
    }

    /**
     * Load a batch of deferred assets during idle time
     */
    loadDeferredBatch(batchSize = 3) {
        if (this.deferredAssets.length === 0) {
            console.log('[ASSET] All deferred assets loaded');
            return;
        }

        const idleCallback = (deadline) => {
            let processed = 0;
            
            // Process assets while we have idle time and assets to load
            while (deadline.timeRemaining() > 0 && 
                   this.deferredAssets.length > 0 && 
                   processed < batchSize) {
                
                const assetPath = this.deferredAssets.shift();
                
                // Start loading this asset (don't await to keep it non-blocking)
                this.loadSingleAsset(assetPath, false)
                    .then(() => {
                        console.log(`[ASSET] Deferred asset loaded: ${assetPath}`);
                    })
                    .catch((error) => {
                        console.warn(`[WARN] Failed to load deferred asset: ${assetPath}`, error);
                    });
                
                processed++;
            }
            
            // Schedule next batch if there are more assets
            if (this.deferredAssets.length > 0) {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(idleCallback, { timeout: 5000 });
                } else {
                    setTimeout(() => idleCallback({ timeRemaining: () => 16 }), 100);
                }
            } else {
                console.log('[ASSET] All assets loaded progressively');
            }
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(idleCallback, { timeout: 5000 });
        } else {
            setTimeout(() => idleCallback({ timeRemaining: () => 16 }), 100);
        }
    }

    /**
     * Load a single asset with proper error handling and caching
     */
    async loadSingleAsset(assetPath, isCritical = false) {
        // Check if already loaded or loading
        if (this.loadedAssets.has(assetPath)) {
            return Promise.resolve();
        }
        
        if (this.loadingPromises.has(assetPath)) {
            return this.loadingPromises.get(assetPath);
        }

        const loadPromise = new Promise(async (resolve, reject) => {
            try {
                const extension = assetPath.split('.').pop().toLowerCase();
                
                if (extension === 'glb') {
                    // For GLB models, we just preload them
                    const response = await fetch(assetPath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    
                    // Don't load the full model here, just ensure it's cached
                    await response.blob();
                    
                } else if (['mp3', 'wav', 'ogg'].includes(extension)) {
                    // iOS Safari blocks audio loading until user interaction
                    // Skip audio preloading on iOS - AudioManager handles lazy loading
                    if (this.isIOS) {
                        console.log(`[ASSET] Skipping audio preload on iOS: ${assetPath}`);
                        // Just resolve immediately - audio will be loaded on first user interaction
                    } else {
                        // For non-iOS, preload audio with a timeout to prevent hanging
                        const audio = new Audio();
                        audio.preload = 'metadata';

                        await new Promise((audioResolve, audioReject) => {
                            const timeout = setTimeout(() => {
                                console.log(`[ASSET] Audio preload timeout: ${assetPath}`);
                                audioResolve(); // Resolve anyway, don't block
                            }, 5000); // 5 second timeout

                            audio.oncanplaythrough = () => {
                                clearTimeout(timeout);
                                audioResolve();
                            };
                            audio.onerror = (err) => {
                                clearTimeout(timeout);
                                audioReject(err);
                            };
                            audio.src = assetPath;
                        });
                    }

                } else if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
                    // For images, preload them
                    const img = new Image();
                    
                    await new Promise((imgResolve, imgReject) => {
                        img.onload = imgResolve;
                        img.onerror = imgReject;
                        img.src = assetPath;
                    });
                    
                } else {
                    // For other assets, just fetch to ensure they're cached
                    const response = await fetch(assetPath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                }
                
                // Cycle 91 Phase 5: record the load BEFORE reporting.
                // reportAssetLoaded compares loadedAssets.size against the
                // critical count; the callers used to add() after the await,
                // so the final critical asset reported size-1 and the
                // critical-assets-complete mark never fired on time.
                this.loadedAssets.add(assetPath);
                this.reportAssetLoaded(assetPath, isCritical);
                resolve();
                
            } catch (error) {
                const priority = isCritical ? 'CRITICAL' : 'deferred';
                console.warn(`[WARN] Failed to load ${priority} asset: ${assetPath}`, error);
                reject(error);
            }
        });

        this.loadingPromises.set(assetPath, loadPromise);
        return loadPromise;
    }

    /**
     * Report asset loading for performance monitoring
     */
    reportAssetLoaded(assetPath, isCritical) {
        const priority = isCritical ? 'critical' : 'deferred';
        const totalLoaded = this.loadedAssets.size;

        // Performance tracking for SEO
        performance.mark(`asset-loaded-${priority}-${totalLoaded}`);
        
        if (totalLoaded === this.criticalAssets.length && isCritical) {
            performance.mark('critical-assets-complete');
            console.log('[ASSET] All critical assets loaded - game ready to start');
        }
    }

    /**
     * Get loading progress for UI display
     */
    getLoadingProgress() {
        const criticalTotal = this.criticalAssets.length;
        const deferredTotal = this.defineDeferredAssets().length;
        const totalAssets = criticalTotal + deferredTotal;
        const loadedCount = this.loadedAssets.size;
        
        return {
            loaded: loadedCount,
            total: totalAssets,
            critical: {
                loaded: Math.min(loadedCount, criticalTotal),
                total: criticalTotal,
                complete: loadedCount >= criticalTotal
            },
            deferred: {
                loaded: Math.max(0, loadedCount - criticalTotal),
                total: deferredTotal,
                complete: loadedCount >= totalAssets
            },
            percentage: Math.round((loadedCount / totalAssets) * 100)
        };
    }

    /**
     * Check if critical assets are ready for gameplay
     */
    areCriticalAssetsReady() {
        return this.loadedAssets.size >= this.criticalAssets.length;
    }

    /**
     * Preload specific asset on demand
     */
    async preloadAsset(assetPath) {
        if (this.loadedAssets.has(assetPath)) {
            return Promise.resolve();
        }
        
        console.log(`[ASSET] Preloading on-demand asset: ${assetPath}`);
        return this.loadSingleAsset(assetPath, false);
    }
}
