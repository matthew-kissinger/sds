// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * FieldConfig - Centralized field configuration for the game
 *
 * Single source of truth for:
 * - Field bounds (play area dimensions)
 * - Gate configuration (position, size, passage zones)
 * - Pasture configuration (retirement area)
 * - Environment placement rules
 *
 * This is CLIENT-SIDE only. Server uses its own bounds from shared/ module.
 * When in multiplayer mode, values come from server.
 * When in sandbox mode, values come from SandboxConfig.
 */

import { Vector2D } from './Vector2D.js';

// Event emitter for config changes
const listeners = new Map();

/**
 * Field size presets
 */
export const FIELD_SIZES = {
    small: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    medium: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    large: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },
    huge: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }
};

/**
 * Field shape definitions
 * Each shape defines how to generate border points for collision and rendering
 */
export const FIELD_SHAPES = {
    square: {
        id: 'square',
        label: 'Square',
        description: 'Classic rectangular field',
        icon: '⬜',
        // Generate border points for this shape
        getBorderPoints: (bounds) => {
            const { minX, maxX, minZ, maxZ } = bounds;
            return [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ }
            ];
        },
        // Gate edge index (0 = first edge, etc.) - square: edge 2 is north edge (maxZ)
        defaultGateEdge: 2,
        // Get gate position centered on the default gate edge
        getGatePosition: (bounds) => {
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    wide: {
        id: 'wide',
        label: 'Wide',
        description: 'Wider than tall',
        icon: '▬',
        getBorderPoints: (bounds) => {
            // Bounds are already modified by modifyBounds, so just use them directly
            const { minX, maxX, minZ, maxZ } = bounds;
            return [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ }
            ];
        },
        modifyBounds: (bounds) => {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const halfWidth = (bounds.maxX - bounds.minX) / 2;
            const halfHeight = (bounds.maxZ - bounds.minZ) / 2;
            return {
                minX: centerX - halfWidth * 1.5,
                maxX: centerX + halfWidth * 1.5,
                minZ: centerZ - halfHeight * 0.7,
                maxZ: centerZ + halfHeight * 0.7
            };
        },
        defaultGateEdge: 2,
        getGatePosition: (bounds) => {
            // Bounds are already modified, so just use maxZ directly
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    tall: {
        id: 'tall',
        label: 'Tall',
        description: 'Taller than wide',
        icon: '▮',
        getBorderPoints: (bounds) => {
            // Bounds are already modified by modifyBounds, so just use them directly
            const { minX, maxX, minZ, maxZ } = bounds;
            return [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ }
            ];
        },
        modifyBounds: (bounds) => {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const halfWidth = (bounds.maxX - bounds.minX) / 2;
            const halfHeight = (bounds.maxZ - bounds.minZ) / 2;
            return {
                minX: centerX - halfWidth * 0.7,
                maxX: centerX + halfWidth * 0.7,
                minZ: centerZ - halfHeight * 1.5,
                maxZ: centerZ + halfHeight * 1.5
            };
        },
        defaultGateEdge: 2,
        getGatePosition: (bounds) => {
            // Bounds are already modified, so just use maxZ directly
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    lShape: {
        id: 'lShape',
        label: 'L-Shape',
        description: 'Corner field',
        icon: '⌐',
        getBorderPoints: (bounds) => {
            const { minX, maxX, minZ, maxZ } = bounds;
            const midX = (minX + maxX) / 2;
            const midZ = (minZ + maxZ) / 2;
            // L-shape: bottom-left corner removed
            return [
                { x: minX, z: midZ },
                { x: minX, z: maxZ },
                { x: maxX, z: maxZ },
                { x: maxX, z: minZ },
                { x: midX, z: minZ },
                { x: midX, z: midZ }
            ];
        },
        // For L-shape, use bounding box for simple collision fallback
        isPointInside: (x, z, bounds) => {
            const { minX, maxX, minZ, maxZ } = bounds;
            const midX = (minX + maxX) / 2;
            const midZ = (minZ + maxZ) / 2;
            // Top half (full width)
            if (z >= midZ && z <= maxZ && x >= minX && x <= maxX) return true;
            // Right half of bottom (right side)
            if (z >= minZ && z < midZ && x >= midX && x <= maxX) return true;
            return false;
        },
        defaultGateEdge: 2, // Edge from top-left to top-right (north edge)
        getGatePosition: (bounds) => {
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    hexagon: {
        id: 'hexagon',
        label: 'Hexagon',
        description: '6-sided field (flat top)',
        icon: '⬡',
        getBorderPoints: (bounds, _originalBounds = null) => {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            // Use half the width as radius (width = 2*radius for hexagon after modifyBounds)
            const radius = (bounds.maxX - bounds.minX) / 2;
            const points = [];
            // Rotated so a FLAT EDGE is at the top (north) for proper gate placement
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI / 3); // Start from right, flat edges top/bottom
                points.push({
                    x: centerX + radius * Math.cos(angle),
                    z: centerZ + radius * Math.sin(angle)
                });
            }
            return points;
        },
        // Modify bounds to account for hexagon shape
        modifyBounds: (bounds) => {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const radius = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
            // Flat-top hexagon: height is radius * sqrt(3), width is 2*radius
            const height = radius * Math.sqrt(3);
            return {
                minX: centerX - radius,
                maxX: centerX + radius,
                minZ: centerZ - height / 2,
                maxZ: centerZ + height / 2
            };
        },
        defaultGateEdge: 2, // Flat top edge
        getGatePosition: (bounds) => {
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    octagon: {
        id: 'octagon',
        label: 'Octagon',
        description: '8-sided field',
        icon: '⯃',
        getBorderPoints: (bounds) => {
            const { minX, maxX, minZ, maxZ } = bounds;
            const width = maxX - minX;
            const height = maxZ - minZ;
            const cut = Math.min(width, height) * 0.3; // Corner cut size
            return [
                { x: minX + cut, z: minZ },
                { x: maxX - cut, z: minZ },
                { x: maxX, z: minZ + cut },
                { x: maxX, z: maxZ - cut },
                { x: maxX - cut, z: maxZ },
                { x: minX + cut, z: maxZ },
                { x: minX, z: maxZ - cut },
                { x: minX, z: minZ + cut }
            ];
        },
        // Gate on edge 5 (the flat north edge from maxX-cut to minX+cut at maxZ)
        defaultGateEdge: 5,
        getGatePosition: (bounds) => {
            // Edge 5 is the flat top edge at maxZ
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    diamond: {
        id: 'diamond',
        label: 'Pentagon',
        description: '5-sided field with flat top edge',
        icon: '⬠',
        getBorderPoints: (bounds) => {
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerZ = (bounds.minZ + bounds.maxZ) / 2;
            const halfWidth = (bounds.maxX - bounds.minX) / 2;
            const halfHeight = (bounds.maxZ - bounds.minZ) / 2;
            // Modified to have a flat top edge for proper gate placement
            // Points: South vertex, East vertex, NE corner, NW corner, West vertex
            const topEdgeWidth = halfWidth * 0.6; // Flat edge at top
            return [
                { x: centerX, z: centerZ - halfHeight },              // 0: South (bottom vertex)
                { x: centerX + halfWidth, z: centerZ },               // 1: East (right vertex)
                { x: centerX + topEdgeWidth, z: centerZ + halfHeight },   // 2: NE corner (flat top)
                { x: centerX - topEdgeWidth, z: centerZ + halfHeight },   // 3: NW corner (flat top)
                { x: centerX - halfWidth, z: centerZ }                // 4: West (left vertex)
            ];
        },
        // Gate on edge 2 (flat north edge between NE and NW corners)
        defaultGateEdge: 2,
        getGatePosition: (bounds) => {
            return { x: 0, z: bounds.maxZ, edgeAngle: 0 };
        }
    },
    custom: {
        id: 'custom',
        label: 'Custom',
        description: 'Draw your own shape',
        // No icon - typography carries the affordance. The other shapes
        // use a literal Unicode glyph as a shape preview; "custom" has
        // no preset shape to preview.
        // Custom shapes use user-drawn border points stored in config
        getBorderPoints: (bounds, customPoints) => {
            // If custom points provided, use them; otherwise fall back to square
            if (customPoints && customPoints.length >= 3) {
                return customPoints;
            }
            const { minX, maxX, minZ, maxZ } = bounds;
            return [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ }
            ];
        },
        isCustom: true
    }
};

/**
 * Gate default settings
 */
export const GATE_DEFAULTS = {
    width: 8,
    height: 4,
    passageDepth: 4  // Depth of passage zone for detection
};

/**
 * Pasture default settings
 */
export const PASTURE_DEFAULTS = {
    depth: 23,           // How deep the pasture extends beyond gate
    width: 60,           // Width of pasture area
    offsetFromGate: 2    // Gap between gate and pasture start
};

/**
 * Environment placement settings
 */
export const ENVIRONMENT_DEFAULTS = {
    farmHouseOffset: { x: 80, z: 60 },  // Offset from field corner
    farmHouseExclusionSize: 80,          // Exclusion zone size
    grassMargin: 5,                       // Extra margin around exclusions
    treeBuffer: 20,                       // Buffer from play area for trees
    rockBuffer: 20                        // Buffer from play area for rocks
};

/**
 * Current field configuration - the active state
 */
let currentConfig = {
    bounds: { ...FIELD_SIZES.medium },
    gate: null,
    pasture: null,
    fieldSize: 'medium'
};

/**
 * Initialize current config with computed gate and pasture
 */
function initializeDefaults() {
    const bounds = currentConfig.bounds;

    // Gate at north edge, centered
    currentConfig.gate = {
        position: new Vector2D(0, bounds.maxZ),
        width: GATE_DEFAULTS.width,
        height: GATE_DEFAULTS.height,
        direction: 'north',
        passageZone: {
            minX: -GATE_DEFAULTS.width / 2,
            maxX: GATE_DEFAULTS.width / 2,
            minZ: bounds.maxZ - GATE_DEFAULTS.passageDepth / 2,
            maxZ: bounds.maxZ + GATE_DEFAULTS.passageDepth / 2
        }
    };

    // Pasture beyond the gate
    currentConfig.pasture = {
        minX: -PASTURE_DEFAULTS.width / 2,
        maxX: PASTURE_DEFAULTS.width / 2,
        minZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate,
        maxZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate + PASTURE_DEFAULTS.depth,
        centerZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate + PASTURE_DEFAULTS.depth / 2
    };
}

// Initialize on module load
initializeDefaults();

/**
 * FieldConfig API
 */
export const FieldConfig = {
    /**
     * Get current field bounds
     */
    getBounds() {
        return { ...currentConfig.bounds };
    },

    /**
     * Get current gate configuration
     */
    getGate() {
        return currentConfig.gate ? {
            position: currentConfig.gate.position.clone(),
            width: currentConfig.gate.width,
            height: currentConfig.gate.height,
            direction: currentConfig.gate.direction,
            passageZone: { ...currentConfig.gate.passageZone }
        } : null;
    },

    /**
     * Get current pasture configuration
     */
    getPasture() {
        return currentConfig.pasture ? { ...currentConfig.pasture } : null;
    },

    /**
     * Get current field size name
     */
    getFieldSize() {
        return currentConfig.fieldSize;
    },

    /**
     * Get farm house position based on current bounds
     */
    getFarmHousePosition() {
        const bounds = currentConfig.bounds;
        return {
            x: bounds.maxX + ENVIRONMENT_DEFAULTS.farmHouseOffset.x,
            z: bounds.maxZ + ENVIRONMENT_DEFAULTS.farmHouseOffset.z
        };
    },

    /**
     * Get farm house exclusion area
     */
    getFarmHouseExclusion() {
        const pos = this.getFarmHousePosition();
        const size = ENVIRONMENT_DEFAULTS.farmHouseExclusionSize;
        return {
            minX: pos.x - size / 2,
            maxX: pos.x + size / 2,
            minZ: pos.z - size / 2,
            maxZ: pos.z + size / 2
        };
    },

    /**
     * Check if position is within play area
     */
    isInPlayArea(x, z, buffer = 0) {
        const b = currentConfig.bounds;
        return x >= b.minX - buffer && x <= b.maxX + buffer &&
               z >= b.minZ - buffer && z <= b.maxZ + buffer;
    },

    /**
     * Check if position is within pasture area
     */
    isInPasture(x, z, buffer = 0) {
        const p = currentConfig.pasture;
        if (!p) return false;
        return x >= p.minX - buffer && x <= p.maxX + buffer &&
               z >= p.minZ - buffer && z <= p.maxZ + buffer;
    },

    /**
     * Set field size by preset name
     */
    setFieldSize(sizeName) {
        if (!FIELD_SIZES[sizeName]) {
            console.warn(`[FIELD CONFIG] Unknown field size: ${sizeName}`);
            return false;
        }

        currentConfig.bounds = { ...FIELD_SIZES[sizeName] };
        currentConfig.fieldSize = sizeName;
        this.recalculateGateAndPasture();
        this.emit('changed', this.getFullConfig());
        return true;
    },

    /**
     * Set custom bounds directly
     */
    setBounds(bounds, gate = null, pasture = null) {
        currentConfig.bounds = { ...bounds };
        currentConfig.fieldSize = 'custom';

        if (gate) {
            currentConfig.gate = {
                position: gate.position instanceof Vector2D ?
                    gate.position.clone() : new Vector2D(gate.position.x, gate.position.z || gate.position.y),
                width: gate.width || GATE_DEFAULTS.width,
                height: gate.height || GATE_DEFAULTS.height,
                direction: gate.direction || 'north',
                passageZone: gate.passageZone ? { ...gate.passageZone } : null
            };

            // Ensure passageZone exists
            if (!currentConfig.gate.passageZone) {
                const g = currentConfig.gate;
                currentConfig.gate.passageZone = {
                    minX: g.position.x - g.width / 2,
                    maxX: g.position.x + g.width / 2,
                    minZ: g.position.z - GATE_DEFAULTS.passageDepth / 2,
                    maxZ: g.position.z + GATE_DEFAULTS.passageDepth / 2
                };
            }
        } else {
            this.recalculateGateAndPasture();
        }

        if (pasture) {
            currentConfig.pasture = { ...pasture };
        }

        this.emit('changed', this.getFullConfig());
    },

    /**
     * Recalculate gate and pasture based on current bounds
     */
    recalculateGateAndPasture() {
        const bounds = currentConfig.bounds;

        // Gate at north edge, centered
        currentConfig.gate = {
            position: new Vector2D(0, bounds.maxZ),
            width: GATE_DEFAULTS.width,
            height: GATE_DEFAULTS.height,
            direction: 'north',
            passageZone: {
                minX: -GATE_DEFAULTS.width / 2,
                maxX: GATE_DEFAULTS.width / 2,
                minZ: bounds.maxZ - GATE_DEFAULTS.passageDepth / 2,
                maxZ: bounds.maxZ + GATE_DEFAULTS.passageDepth / 2
            }
        };

        // Pasture beyond the gate
        currentConfig.pasture = {
            minX: -PASTURE_DEFAULTS.width / 2,
            maxX: PASTURE_DEFAULTS.width / 2,
            minZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate,
            maxZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate + PASTURE_DEFAULTS.depth,
            centerZ: bounds.maxZ + PASTURE_DEFAULTS.offsetFromGate + PASTURE_DEFAULTS.depth / 2
        };
    },

    /**
     * Get full configuration object
     */
    getFullConfig() {
        return {
            bounds: this.getBounds(),
            gate: this.getGate(),
            pasture: this.getPasture(),
            fieldSize: currentConfig.fieldSize,
            farmHouse: {
                position: this.getFarmHousePosition(),
                exclusion: this.getFarmHouseExclusion()
            },
            environment: { ...ENVIRONMENT_DEFAULTS }
        };
    },

    /**
     * Reset to default medium field
     */
    reset() {
        currentConfig.bounds = { ...FIELD_SIZES.medium };
        currentConfig.fieldSize = 'medium';
        initializeDefaults();
        this.emit('changed', this.getFullConfig());
    },

    /**
     * Subscribe to configuration changes
     */
    on(event, callback) {
        if (!listeners.has(event)) {
            listeners.set(event, []);
        }
        listeners.get(event).push(callback);

        // Return unsubscribe function
        return () => {
            const eventListeners = listeners.get(event);
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        };
    },

    /**
     * Emit an event to all listeners
     */
    emit(event, data) {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[FIELD CONFIG] Error in listener:`, error);
                }
            });
        }
    },

    /**
     * Get all possible gate areas for sheep boundary checking
     * Used when sheep need to know where gates might be
     */
    getPossibleGateAreas() {
        const bounds = currentConfig.bounds;
        const gateWidth = GATE_DEFAULTS.width;
        const halfWidth = gateWidth / 2;

        // Return gate areas for all possible directions
        // This replaces the hardcoded values in OptimizedSheep.js
        return [
            // North gate (default)
            { minX: -halfWidth, maxX: halfWidth, minZ: bounds.maxZ - 2, maxZ: bounds.maxZ + 2, direction: 'north' },
            // South gate
            { minX: -halfWidth, maxX: halfWidth, minZ: bounds.minZ - 2, maxZ: bounds.minZ + 2, direction: 'south' },
            // East gate
            { minX: bounds.maxX - 2, maxX: bounds.maxX + 2, minZ: -halfWidth, maxZ: halfWidth, direction: 'east' },
            // West gate
            { minX: bounds.minX - 2, maxX: bounds.minX + 2, minZ: -halfWidth, maxZ: halfWidth, direction: 'west' }
        ];
    }
};

// Log initial config
console.log('[FIELD CONFIG] Initialized with default medium field');
