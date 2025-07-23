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
        
        console.log('🚀 GameAssetLoader initialized for progressive loading');
    }

    /**
     * Define critical assets that must load first for core gameplay
     */
    defineCriticalAssets() {
        return [
            // Essential dog textures
            'assets/models/Jep.glb',
            'assets/models/Sally.glb',
            'assets/models/Rauri.glb',
            'assets/models/Shiloh.glb',
            
            // Core sheep and terrain (first priority)
            'assets/LP_BorderCollie_Blend_v01/texture/PolyArt_Dogs_color.png',
            
            // Essential UI sounds
            'assets/sounds_compressed/ui_click.mp3',
            'assets/sounds_compressed/dog_bark_jep.mp3',
            
            // Critical terrain models
            'assets/models/Resource_Tree1.glb',
            'assets/models/Resource_Rock_1.glb'
        ];
    }

    /**
     * Define deferred assets that can load during idle time
     */
    defineDeferredAssets() {
        return [
            // Additional dog models
            'assets/models/George_Washington.glb',
            
            // Environment details
            'assets/models/Farm house.glb',
            'assets/models/Mountain_Group_1.glb',
            'assets/models/Mountain_Group_2.glb',
            'assets/models/Resource_Tree2.glb',
            'assets/models/Resource_Rock_2.glb',
            'assets/models/Resource_Rock_3.glb',
            'assets/models/Resource_PineTree.glb',
            
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
            'assets/sounds_compressed/dog_bark_rauri.mp3',
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
        
        console.log('⚡ Loading critical assets for immediate gameplay...', {
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
                    console.log(`✅ Critical asset loaded: ${assetPath}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to load critical asset: ${assetPath}`, error);
                    // Don't fail the whole batch for one asset
                }
            });

            await Promise.all(loadPromises);
            
            const loadTime = performance.now() - startTime;
            console.log(`🎯 Critical assets loaded in ${Math.round(loadTime)}ms`);
            
            // Start deferred loading after critical assets are done
            this.startDeferredLoading();
            
        } catch (error) {
            console.error('❌ Critical asset loading failed:', error);
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
        
        console.log('🏃‍♂️ Starting deferred asset loading during idle time...', {
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
            console.log('✅ All deferred assets loaded');
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
                        console.log(`🎨 Deferred asset loaded: ${assetPath}`);
                    })
                    .catch((error) => {
                        console.warn(`⚠️ Failed to load deferred asset: ${assetPath}`, error);
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
                console.log('🎉 All assets loaded progressively');
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
                    // For audio files, preload them
                    const audio = new Audio();
                    audio.preload = 'metadata';
                    
                    await new Promise((audioResolve, audioReject) => {
                        audio.oncanplaythrough = audioResolve;
                        audio.onerror = audioReject;
                        audio.src = assetPath;
                    });
                    
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
                console.warn(`⚠️ Failed to load ${priority} asset: ${assetPath}`, error);
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
        const totalAssets = this.criticalAssets.length + this.deferredAssets.length;
        
        // Performance tracking for SEO
        performance.mark(`asset-loaded-${priority}-${totalLoaded}`);
        
        if (totalLoaded === this.criticalAssets.length && isCritical) {
            performance.mark('critical-assets-complete');
            console.log('🎯 All critical assets loaded - game ready to start');
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
        
        console.log(`🔄 Preloading on-demand asset: ${assetPath}`);
        return this.loadSingleAsset(assetPath, false);
    }
}
