/**
 * PerformanceMonitor.js
 * 
 * Comprehensive performance monitoring system for the sheep dog simulation.
 * Integrates Stats.js for real-time FPS/memory tracking and provides
 * custom metrics for simulation-specific performance analysis.
 */

/**
 * Performance monitoring and statistics display
 * Provides real-time FPS, memory usage, and simulation-specific metrics
 */
export class PerformanceMonitor {
    constructor() {
        this.stats = null;
        this.customStats = null;
        this.isEnabled = false;
        this.frameCount = 0;
        this.lastFrameTime = performance.now();
        this.frameTimeHistory = [];
        this.maxHistoryLength = 60; // Keep 1 second of frame times at 60fps
        
        // Performance metrics
        this.metrics = {
            sheepCount: 0,
            activeSheepCount: 0,
            grassInstances: 0,
            drawCalls: 0,
            triangles: 0,
            avgFrameTime: 0,
            minFrameTime: Infinity,
            maxFrameTime: 0,
            geometries: 0,
            textures: 0,
            programs: 0
        };
        
        this.init();
    }
    
    /**
     * Initialize Stats.js and custom performance displays
     */
    async init() {
        try {
            // Try to load Stats.js from CDN using a script tag
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/stats.js@0.17.0/build/stats.min.js';
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            
            // Wait a bit for Stats to be available globally
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (typeof Stats !== 'undefined') {
                // Create main Stats.js instance for FPS
                this.stats = new Stats();
                this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
                this.stats.dom.style.position = 'absolute';
                this.stats.dom.style.left = '20px';
                this.stats.dom.style.top = '120px';
                this.stats.dom.style.zIndex = '100';
                
                // Create custom stats panel for simulation metrics
                this.createCustomStatsPanel();
                
                // Add to DOM but hide by default
                document.body.appendChild(this.stats.dom);
                document.body.appendChild(this.customStats);
                
                // Hide stats by default
                this.stats.dom.style.display = 'none';
                this.customStats.style.display = 'none';
                
                this.isEnabled = true;
                console.log('PerformanceMonitor: Stats.js integration successful');
            } else {
                throw new Error('Stats.js not available');
            }
            
        } catch (error) {
            console.warn('PerformanceMonitor: Failed to load Stats.js, using fallback metrics', error);
            this.createFallbackDisplay();
        }
    }
    
    /**
     * Create custom statistics panel for simulation-specific metrics
     */
    createCustomStatsPanel() {
        this.customStats = document.createElement('div');
        this.customStats.style.cssText = `
            position: absolute;
            left: 20px;
            top: 200px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 8px;
            border-radius: 4px;
            z-index: 100;
            min-width: 180px;
            line-height: 1.4;
        `;
        
        this.updateCustomStats();
    }
    
    /**
     * Create fallback display when Stats.js fails to load
     */
    createFallbackDisplay() {
        this.customStats = document.createElement('div');
        this.customStats.style.cssText = `
            position: absolute;
            left: 20px;
            top: 120px;
            background: rgba(0, 0, 0, 0.8);
            color: #ffff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 8px;
            border-radius: 4px;
            z-index: 100;
            min-width: 200px;
            line-height: 1.4;
        `;
        
        document.body.appendChild(this.customStats);
        
        // Hide stats by default
        this.customStats.style.display = 'none';
        
        this.isEnabled = true;
    }
    
    /**
     * Update performance metrics
     * @param {Object} gameState - Current game state
     * @param {Object} renderer - Three.js renderer
     */
    updateMetrics(gameState, renderer) {
        if (!this.isEnabled) return;
        
        const currentTime = performance.now();
        const frameTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        // Update frame time statistics
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > this.maxHistoryLength) {
            this.frameTimeHistory.shift();
        }
        
        // Calculate frame time metrics
        this.metrics.avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
        this.metrics.minFrameTime = Math.min(this.metrics.minFrameTime, frameTime);
        this.metrics.maxFrameTime = Math.max(this.metrics.maxFrameTime, frameTime);
        
        // Update simulation metrics
        if (gameState) {
            const sheep = gameState.getSheep();
            this.metrics.sheepCount = sheep ? sheep.length : 0;
            // Count sheep that haven't passed the gate and aren't retiring (active sheep)
            this.metrics.activeSheepCount = sheep ? sheep.filter(s => !s.hasPassedGate && !s.isRetiring).length : 0;
        }
        
        // Update renderer metrics
        if (renderer && renderer.info) {
            this.metrics.drawCalls = renderer.info.render.calls;
            this.metrics.triangles = renderer.info.render.triangles;
            this.metrics.geometries = renderer.info.memory.geometries;
            this.metrics.textures = renderer.info.memory.textures;
            this.metrics.programs = renderer.info.programs ? renderer.info.programs.length : 0;
        }
        
        this.frameCount++;
        
        // Update displays
        if (this.stats) {
            this.stats.update();
        }
        
        // Update custom stats every 10 frames to reduce overhead
        if (this.frameCount % 10 === 0) {
            this.updateCustomStats();
        }
    }
    
    /**
     * Update custom statistics display
     */
    updateCustomStats() {
        if (!this.customStats) return;
        
        const fps = this.frameTimeHistory.length > 0 ? 
            (1000 / this.metrics.avgFrameTime).toFixed(1) : '0';
        
        const memoryInfo = this.getMemoryInfo();
        
        // Color-code FPS for performance indication
        const fpsColor = parseFloat(fps) >= 58 ? '#00ff00' : parseFloat(fps) >= 45 ? '#ffff00' : '#ff4444';
        
        this.customStats.innerHTML = `
            <div style="color: #00ff00; font-weight: bold; margin-bottom: 4px;">SIMULATION STATS</div>
            <div>Sheep Total: ${this.metrics.sheepCount}</div>
            <div>Sheep Active: ${this.metrics.activeSheepCount}</div>
            <div>Grass Instances: ${this.metrics.grassInstances.toLocaleString()}</div>
            <div style="margin-top: 4px; color: #ffff00;">RENDER STATS</div>
            <div>Draw Calls: ${this.metrics.drawCalls}</div>
            <div>Triangles: ${this.metrics.triangles.toLocaleString()}</div>
            <div>Geometries: ${this.metrics.geometries}</div>
            <div>Textures: ${this.metrics.textures}</div>
            <div>Programs: ${this.metrics.programs}</div>
            <div style="margin-top: 4px; color: #ff8800;">FRAME STATS</div>
            <div style="color: ${fpsColor};">Avg FPS: ${fps}</div>
            <div>Frame Time: ${this.metrics.avgFrameTime.toFixed(2)}ms</div>
            <div>Min/Max: ${this.metrics.minFrameTime.toFixed(1)}/${this.metrics.maxFrameTime.toFixed(1)}ms</div>
            ${memoryInfo}
        `;
    }
    
    /**
     * Get memory information if available
     */
    getMemoryInfo() {
        if (performance.memory) {
            const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
            const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
            return `
                <div style="margin-top: 4px; color: #ff4444;">MEMORY</div>
                <div>Used: ${used} MB</div>
                <div>Total: ${total} MB</div>
            `;
        }
        return '';
    }
    
    /**
     * Set grass instance count for display
     * @param {number} count - Number of grass instances
     */
    setGrassInstanceCount(count) {
        this.metrics.grassInstances = count;
    }
    
    /**
     * Toggle performance monitor visibility
     */
    toggle() {
        if (!this.isEnabled) return;
        
        const isVisible = this.stats ? this.stats.dom.style.display !== 'none' : 
                         this.customStats.style.display !== 'none';
        
        if (this.stats) {
            this.stats.dom.style.display = isVisible ? 'none' : 'block';
        }
        if (this.customStats) {
            this.customStats.style.display = isVisible ? 'none' : 'block';
        }
    }
    
    /**
     * Show performance monitor
     */
    show() {
        if (!this.isEnabled) return;
        
        if (this.stats) {
            this.stats.dom.style.display = 'block';
        }
        if (this.customStats) {
            this.customStats.style.display = 'block';
        }
    }
    
    /**
     * Hide performance monitor
     */
    hide() {
        if (!this.isEnabled) return;
        
        if (this.stats) {
            this.stats.dom.style.display = 'none';
        }
        if (this.customStats) {
            this.customStats.style.display = 'none';
        }
    }
    
    /**
     * Reset performance statistics
     */
    reset() {
        this.frameTimeHistory = [];
        this.metrics.minFrameTime = Infinity;
        this.metrics.maxFrameTime = 0;
        this.frameCount = 0;
    }
    
    /**
     * Get current performance metrics
     * @returns {Object} Current metrics object
     */
    getMetrics() {
        return { ...this.metrics };
    }
    
    /**
     * Check if performance monitor is enabled
     * @returns {boolean} True if enabled
     */
    isActive() {
        return this.isEnabled;
    }
    
    /**
     * Get performance recommendations based on current metrics
     * @returns {Array} Array of performance recommendations
     */
    getPerformanceRecommendations() {
        const recommendations = [];
        const avgFps = this.frameTimeHistory.length > 0 ? 
            (1000 / this.metrics.avgFrameTime) : 0;
        
        if (avgFps < 45) {
            recommendations.push("Low FPS detected. Consider reducing grass instances or shadow quality.");
        }
        
        if (this.metrics.drawCalls > 50) {
            recommendations.push("High draw call count. Consider using more instanced rendering.");
        }
        
        if (this.metrics.triangles > 2000000) {
            recommendations.push("High triangle count. Consider using LOD (Level of Detail) systems.");
        }
        
        if (this.metrics.grassInstances > 500000 && avgFps < 60) {
            recommendations.push("Grass instance count may be too high for current hardware.");
        }
        
        return recommendations;
    }
    
    /**
     * Log performance summary to console
     */
    logPerformanceSummary() {
        if (!this.isEnabled) return;
        
        const avgFps = this.frameTimeHistory.length > 0 ? 
            (1000 / this.metrics.avgFrameTime).toFixed(1) : '0';
        
        console.group('🔍 Performance Summary');
        console.log(`📊 Average FPS: ${avgFps}`);
        console.log(`🐑 Active Sheep: ${this.metrics.activeSheepCount}/${this.metrics.sheepCount}`);
        console.log(`🌱 Grass Instances: ${this.metrics.grassInstances.toLocaleString()}`);
        console.log(`🎨 Draw Calls: ${this.metrics.drawCalls}`);
        console.log(`📐 Triangles: ${this.metrics.triangles.toLocaleString()}`);
        console.log(`⏱️ Frame Time: ${this.metrics.avgFrameTime.toFixed(2)}ms`);
        
        const recommendations = this.getPerformanceRecommendations();
        if (recommendations.length > 0) {
            console.group('💡 Recommendations');
            recommendations.forEach(rec => console.log(`• ${rec}`));
            console.groupEnd();
        }
        
        console.groupEnd();
    }
} 