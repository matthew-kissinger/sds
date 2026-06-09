// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
        return [
            // Essential dog models (optimized)
            'assets/models/Jep.glb',
            'assets/models/Sally.glb',
            'assets/models/Pip.glb',
            'assets/models/Shiloh.glb',

            // Core sheep and terrain (first priority)
            'assets/LP_BorderCollie_Blend_v01/texture/PolyArt_Dogs_color.png',

            // Essential UI sounds
            'assets/sounds_compressed/ui_click.mp3',
            'assets/sounds_compressed/dog_bark_jep.mp3',

            // Critical terrain models
            'assets/models/trees/tree1.glb',
            'assets/models/rocks/rock1.glb'
        ];
    }

    /**
     * Define deferred assets that can load during idle time
     */
    defineDeferredAssets() {
        return [
            // Additional dog model
            'assets/models/George_Washington.glb',

            // Fence and gate kit (one shared-texture GLB for all four pieces)
            'assets/models/Fence_Kit-v1.0.0.glb',

            // Environment details
            'assets/models/Farm house.glb',
            'assets/models/Mountain_Group_1.glb',
            'assets/models/Mountain_Group_2.glb',
            'assets/models/trees/tree2.glb',
            'assets/models/rocks/rock2.glb',
            'assets/models/rocks/rock3.glb',

            // Cycle 22 Phase A: meshopt-baked LOD1 (geometry-simplified, same
            // leaf count as LOD0). Loaded eagerly so InstancedMesh2.addLOD
            // wires them in on first scene build.
            'assets/models/trees/tree1_lod1.glb',
            'assets/models/trees/tree2_lod1.glb',
            
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
                    this.loadedAssets.add(assetPath);
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
                        this.loadedAssets.add(assetPath);
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
