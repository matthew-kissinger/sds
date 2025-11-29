import { Vector2D } from './Vector2D.js';
import { FIELD_SIZES, FIELD_SHAPES, GATE_DEFAULTS, PASTURE_DEFAULTS } from './FieldConfig.js';

/**
 * SandboxConfig - Configuration class for sandbox/creative mode
 *
 * Stores all customizable parameters for a sandbox game:
 * - Sheep count and behavior
 * - Field size
 * - Custom fence placements
 * - Gate and pasture configurations
 * - Game rules (timer, win conditions)
 */
export class SandboxConfig {
    constructor(config = {}) {
        // Unique identifier for saved configs
        this.id = config.id || this.generateId();
        this.name = config.name || 'Untitled Sandbox';
        this.description = config.description || '';
        this.createdAt = config.createdAt || Date.now();
        this.updatedAt = config.updatedAt || Date.now();

        // Sheep configuration
        this.sheep = {
            count: config.sheep?.count || 200,
            spawnArea: config.sheep?.spawnArea || null, // null = default random spawn
            behavior: {
                speed: config.sheep?.behavior?.speed || 0.1,
                cohesion: config.sheep?.behavior?.cohesion || 1.0,
                separationDistance: config.sheep?.behavior?.separationDistance || 2.0
            }
        };

        // Field configuration - ALWAYS compute bounds from size (ignore any passed bounds)
        // This ensures bounds are always correct when size changes
        const fieldSize = config.field?.size || 'medium';
        const fieldShape = config.field?.shape || 'square';
        let baseBounds = this.getDefaultBounds(fieldSize);

        // Apply shape modifications to bounds if needed
        const shapeConfig = FIELD_SHAPES[fieldShape];
        if (shapeConfig?.modifyBounds) {
            baseBounds = shapeConfig.modifyBounds(baseBounds);
        }

        // For custom shapes, use the stored custom border points
        const customBorderPoints = config.field?.customBorderPoints || null;
        let borderPoints = null;

        if (fieldShape === 'custom' && customBorderPoints && customBorderPoints.length >= 3) {
            // Use the user-drawn custom points
            borderPoints = customBorderPoints;
        } else if (shapeConfig?.getBorderPoints) {
            // Use the shape's getBorderPoints function
            borderPoints = shapeConfig.getBorderPoints(baseBounds, customBorderPoints);
        }

        this.field = {
            size: fieldSize,
            shape: fieldShape,
            bounds: baseBounds,
            // Store border points for polygon-based shapes
            borderPoints: borderPoints,
            // Also store the custom points separately for the editor
            customBorderPoints: customBorderPoints
        };

        console.log(`[SANDBOX CONFIG] Field size: ${fieldSize}, shape: ${fieldShape}, bounds:`, this.field.bounds);

        // Fence segments - array of custom fence placements
        // Each segment: { start: {x, z}, end: {x, z}, type: 'fence'|'gate' }
        this.fences = config.fences || [];

        // Gate and pasture configuration
        const bounds = this.field.bounds;
        const pastureWidth = 60;
        const pastureDepth = 23;
        const pastureOffset = 2;

        // CUSTOM shapes: preserve user-placed gate position and angle
        // PRESET shapes: always use north edge (simplified like classic mode)
        if (fieldShape === 'custom' && config.gates && config.gates.length > 0) {
            // Custom shapes preserve the exact gate position and angle from ShapeEditor
            this.gates = config.gates.map((gate) => ({
                ...gate,
                position: {
                    x: gate.position?.x ?? 0,
                    z: gate.position?.z ?? bounds.maxZ
                },
                edgeAngle: gate.edgeAngle ?? 0
            }));

            // For custom shapes, position pasture perpendicular to the gate angle
            const mainGate = this.gates[0];
            const edgeAngle = mainGate.edgeAngle || 0;

            // Direction perpendicular to gate edge, pointing outward
            const outwardX = Math.sin(edgeAngle);
            const outwardZ = Math.cos(edgeAngle);
            const pastureCenterX = mainGate.position.x + outwardX * (pastureDepth / 2 + pastureOffset);
            const pastureCenterZ = mainGate.position.z + outwardZ * (pastureDepth / 2 + pastureOffset);

            this.pastures = [{
                minX: pastureCenterX - pastureWidth / 2,
                maxX: pastureCenterX + pastureWidth / 2,
                minZ: pastureCenterZ - pastureDepth / 2,
                maxZ: pastureCenterZ + pastureDepth / 2,
                gateIndex: 0,
                edgeAngle: edgeAngle
            }];
        } else {
            // PRESET shapes: simplified approach - gate always on north edge
            if (config.gates && config.gates.length > 0) {
                this.gates = config.gates.map((gate) => ({
                    ...gate,
                    position: {
                        x: gate.position?.x ?? 0,
                        z: bounds.maxZ  // Always on north edge
                    },
                    direction: 'north'
                }));
            } else {
                this.gates = [{
                    position: { x: 0, z: bounds.maxZ },
                    width: 8,
                    direction: 'north'
                }];
            }

            // Pasture beyond north edge
            this.pastures = [{
                minX: -pastureWidth / 2,
                maxX: pastureWidth / 2,
                minZ: bounds.maxZ + pastureOffset,
                maxZ: bounds.maxZ + pastureOffset + pastureDepth,
                gateIndex: 0
            }];
        }

        // Game rules
        this.rules = {
            timerEnabled: config.rules?.timerEnabled ?? false,
            timerMode: config.rules?.timerMode || 'countup', // 'countup', 'countdown'
            timeLimit: config.rules?.timeLimit || 180, // seconds for countdown
            winCondition: config.rules?.winCondition || 'all', // 'all', 'percentage', 'none'
            winPercentage: config.rules?.winPercentage || 100,
            trackBestTime: config.rules?.trackBestTime ?? true
        };

        // Dog configuration
        this.dog = {
            startPosition: config.dog?.startPosition || { x: 0, z: -30 },
            type: config.dog?.type || null // null = use selected dog
        };

        // Preset configuration (for fence layouts)
        const newPreset = config.preset || 'open';
        const oldPreset = config._previousPreset;
        this.preset = newPreset;

        // Apply preset if it changed (and not custom which preserves existing fences)
        // Always apply preset when it's a named preset and either:
        // 1. It just changed from a different preset
        // 2. We have no fences yet
        if (newPreset && newPreset !== 'custom') {
            const presetChanged = oldPreset !== undefined && oldPreset !== newPreset;
            const noFences = !config.fences || config.fences.length === 0;

            if (presetChanged || noFences) {
                this.applyPreset(newPreset);
            }
        }

        // Store current preset for change detection
        this._previousPreset = newPreset;
    }

    /**
     * Generate a unique ID for the config
     */
    generateId() {
        return 'sandbox_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get default bounds for a field size
     */
    getDefaultBounds(size) {
        return FIELD_SIZES[size] ? { ...FIELD_SIZES[size] } : { ...FIELD_SIZES.medium };
    }

    /**
     * Set field size and update bounds
     */
    setFieldSize(size) {
        this.field.size = size;
        if (size !== 'custom') {
            this.field.bounds = this.getDefaultBounds(size);
            // Update gate position to match new bounds
            if (this.gates.length > 0) {
                this.gates[0].position.z = this.field.bounds.maxZ;
            }
            // Update pasture position
            if (this.pastures.length > 0) {
                const bounds = this.field.bounds;
                this.pastures[0] = {
                    minX: -30,
                    maxX: 30,
                    minZ: bounds.maxZ + 2,
                    maxZ: bounds.maxZ + 25,
                    gateIndex: 0
                };
            }
        }
        this.updatedAt = Date.now();
    }

    /**
     * Add a fence segment
     */
    addFence(start, end, type = 'fence') {
        this.fences.push({
            id: 'fence_' + Date.now().toString(36),
            start: { x: start.x, z: start.z },
            end: { x: end.x, z: end.z },
            type: type
        });
        this.preset = 'custom';
        this.updatedAt = Date.now();
    }

    /**
     * Remove a fence segment by ID
     */
    removeFence(fenceId) {
        this.fences = this.fences.filter(f => f.id !== fenceId);
        this.updatedAt = Date.now();
    }

    /**
     * Clear all custom fences
     */
    clearFences() {
        this.fences = [];
        this.updatedAt = Date.now();
    }

    /**
     * Add a gate
     */
    addGate(position, width = 8, direction = 'north') {
        const gateIndex = this.gates.length;
        this.gates.push({
            position: { x: position.x, z: position.z },
            width: width,
            direction: direction
        });

        // Create a pasture for this gate
        const pastureDepth = 25;
        let pasture;
        switch (direction) {
            case 'north':
                pasture = {
                    minX: position.x - 30,
                    maxX: position.x + 30,
                    minZ: position.z + 2,
                    maxZ: position.z + pastureDepth,
                    gateIndex: gateIndex
                };
                break;
            case 'south':
                pasture = {
                    minX: position.x - 30,
                    maxX: position.x + 30,
                    minZ: position.z - pastureDepth,
                    maxZ: position.z - 2,
                    gateIndex: gateIndex
                };
                break;
            case 'east':
                pasture = {
                    minX: position.x + 2,
                    maxX: position.x + pastureDepth,
                    minZ: position.z - 30,
                    maxZ: position.z + 30,
                    gateIndex: gateIndex
                };
                break;
            case 'west':
                pasture = {
                    minX: position.x - pastureDepth,
                    maxX: position.x - 2,
                    minZ: position.z - 30,
                    maxZ: position.z + 30,
                    gateIndex: gateIndex
                };
                break;
        }
        this.pastures.push(pasture);
        this.updatedAt = Date.now();

        return gateIndex;
    }

    /**
     * Remove a gate and its associated pasture
     */
    removeGate(gateIndex) {
        if (this.gates.length <= 1) {
            console.warn('Cannot remove the last gate');
            return false;
        }
        this.gates.splice(gateIndex, 1);
        this.pastures = this.pastures.filter(p => p.gateIndex !== gateIndex);
        // Re-index pastures
        this.pastures.forEach(p => {
            if (p.gateIndex > gateIndex) {
                p.gateIndex--;
            }
        });
        this.updatedAt = Date.now();
        return true;
    }

    /**
     * Apply a preset fence layout
     */
    applyPreset(presetName) {
        this.clearFences();
        this.preset = presetName;

        const bounds = this.field.bounds;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;
        const halfWidth = (bounds.maxX - bounds.minX) / 2;
        const halfDepth = (bounds.maxZ - bounds.minZ) / 2;

        switch (presetName) {
            case 'open':
                // No internal fences, just the border
                break;

            case 'corridor':
                // Create a corridor leading to the gate
                const corridorWidth = 20;
                this.addFence(
                    { x: centerX - corridorWidth, z: bounds.minZ },
                    { x: centerX - corridorWidth, z: bounds.maxZ - 20 }
                );
                this.addFence(
                    { x: centerX + corridorWidth, z: bounds.minZ },
                    { x: centerX + corridorWidth, z: bounds.maxZ - 20 }
                );
                break;

            case 'funnel':
                // Funnel shape leading to gate
                this.addFence(
                    { x: bounds.minX + 20, z: bounds.minZ + 20 },
                    { x: centerX - 10, z: bounds.maxZ - 30 }
                );
                this.addFence(
                    { x: bounds.maxX - 20, z: bounds.minZ + 20 },
                    { x: centerX + 10, z: bounds.maxZ - 30 }
                );
                break;

            case 'maze':
                // Simple maze pattern
                const segmentLength = halfWidth * 0.6;
                // Horizontal segments
                this.addFence(
                    { x: bounds.minX, z: centerZ - halfDepth * 0.3 },
                    { x: bounds.minX + segmentLength, z: centerZ - halfDepth * 0.3 }
                );
                this.addFence(
                    { x: bounds.maxX, z: centerZ + halfDepth * 0.3 },
                    { x: bounds.maxX - segmentLength, z: centerZ + halfDepth * 0.3 }
                );
                // Vertical segments
                this.addFence(
                    { x: centerX, z: bounds.minZ },
                    { x: centerX, z: centerZ - halfDepth * 0.2 }
                );
                this.addFence(
                    { x: centerX - halfWidth * 0.4, z: centerZ },
                    { x: centerX - halfWidth * 0.4, z: bounds.maxZ - 30 }
                );
                this.addFence(
                    { x: centerX + halfWidth * 0.4, z: centerZ },
                    { x: centerX + halfWidth * 0.4, z: bounds.maxZ - 30 }
                );
                break;

            case 'obstacles':
                // Random obstacle fences
                const obstaclePositions = [
                    { x: -40, z: -30, length: 30, vertical: true },
                    { x: 40, z: -30, length: 30, vertical: true },
                    { x: -20, z: 20, length: 40, vertical: false },
                    { x: 20, z: 50, length: 30, vertical: false },
                    { x: 0, z: -60, length: 50, vertical: false }
                ];
                obstaclePositions.forEach(obs => {
                    if (obs.vertical) {
                        this.addFence(
                            { x: obs.x, z: obs.z },
                            { x: obs.x, z: obs.z + obs.length }
                        );
                    } else {
                        this.addFence(
                            { x: obs.x - obs.length/2, z: obs.z },
                            { x: obs.x + obs.length/2, z: obs.z }
                        );
                    }
                });
                break;

            default:
                console.warn(`Unknown preset: ${presetName}`);
        }

        this.updatedAt = Date.now();
    }

    /**
     * Convert to GameState compatible format
     */
    toGameStateFormat() {
        const bounds = this.field.bounds;
        const mainGate = this.gates[0];
        const mainPasture = this.pastures[0];

        return {
            bounds: bounds,
            fieldShape: this.field.shape,
            borderPoints: this.field.borderPoints,
            gate: {
                position: new Vector2D(mainGate.position.x, mainGate.position.z),
                width: mainGate.width,
                height: 4,
                direction: mainGate.direction || 'north',
                edgeAngle: mainGate.edgeAngle, // Include edge angle for custom shapes
                passageZone: {
                    minX: mainGate.position.x - mainGate.width / 2,
                    maxX: mainGate.position.x + mainGate.width / 2,
                    minZ: mainGate.position.z - 2,
                    maxZ: mainGate.position.z + 2
                }
            },
            pasture: {
                centerZ: (mainPasture.minZ + mainPasture.maxZ) / 2,
                minX: mainPasture.minX,
                maxX: mainPasture.maxX,
                minZ: mainPasture.minZ,
                maxZ: mainPasture.maxZ
            },
            totalSheep: this.sheep.count,
            params: this.sheep.behavior,
            customFences: this.fences,
            rules: this.rules,
            dogStartPosition: this.dog.startPosition
        };
    }

    /**
     * Serialize to JSON for storage
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            sheep: this.sheep,
            field: this.field,
            fences: this.fences,
            gates: this.gates,
            pastures: this.pastures,
            rules: this.rules,
            dog: this.dog,
            preset: this.preset
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new SandboxConfig(json);
    }

    /**
     * Save to localStorage
     */
    saveLocal() {
        try {
            const savedConfigs = JSON.parse(localStorage.getItem('sandboxConfigs') || '[]');
            const existingIndex = savedConfigs.findIndex(c => c.id === this.id);

            if (existingIndex >= 0) {
                savedConfigs[existingIndex] = this.toJSON();
            } else {
                savedConfigs.push(this.toJSON());
            }

            localStorage.setItem('sandboxConfigs', JSON.stringify(savedConfigs));
            console.log(`[SANDBOX] Config saved locally: ${this.name}`);
            return true;
        } catch (error) {
            console.error('[SANDBOX] Failed to save config:', error);
            return false;
        }
    }

    /**
     * Load all configs from localStorage
     */
    static loadAllLocal() {
        try {
            const savedConfigs = JSON.parse(localStorage.getItem('sandboxConfigs') || '[]');
            return savedConfigs.map(json => SandboxConfig.fromJSON(json));
        } catch (error) {
            console.error('[SANDBOX] Failed to load configs:', error);
            return [];
        }
    }

    /**
     * Delete from localStorage
     */
    static deleteLocal(configId) {
        try {
            const savedConfigs = JSON.parse(localStorage.getItem('sandboxConfigs') || '[]');
            const filtered = savedConfigs.filter(c => c.id !== configId);
            localStorage.setItem('sandboxConfigs', JSON.stringify(filtered));
            return true;
        } catch (error) {
            console.error('[SANDBOX] Failed to delete config:', error);
            return false;
        }
    }

    /**
     * Create a default sandbox config
     */
    static createDefault() {
        return new SandboxConfig({
            name: 'Default Sandbox',
            sheep: { count: 200 },
            field: { size: 'medium' },
            preset: 'open'
        });
    }
}
