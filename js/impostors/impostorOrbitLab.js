import {
    selectLatLonHemiYImpostorTiles,
    selectOctahedralImpostorTiles,
} from './impostorTileSelection.js';

const DEFAULT_ORBIT_POSES = Object.freeze([
    { id: 'north-low', yawDeg: 0, pitchDeg: 8 },
    { id: 'north-east-low', yawDeg: 45, pitchDeg: 8 },
    { id: 'east-low', yawDeg: 90, pitchDeg: 8 },
    { id: 'south-east-low', yawDeg: 135, pitchDeg: 8 },
    { id: 'south-low', yawDeg: 180, pitchDeg: 8 },
    { id: 'south-west-low', yawDeg: 225, pitchDeg: 8 },
    { id: 'west-low', yawDeg: 270, pitchDeg: 8 },
    { id: 'north-west-low', yawDeg: 315, pitchDeg: 8 },
    { id: 'north-mid', yawDeg: 0, pitchDeg: 28 },
    { id: 'east-mid', yawDeg: 90, pitchDeg: 28 },
    { id: 'south-mid', yawDeg: 180, pitchDeg: 28 },
    { id: 'west-mid', yawDeg: 270, pitchDeg: 28 },
]);

const DEFAULT_LAYOUTS = Object.freeze(['latlon-hemi-y', 'octahedral']);

function round(value, digits = 4) {
    return Number(value.toFixed(digits));
}

function directionFromPose({ yawDeg = 0, pitchDeg = 0 }) {
    const yaw = yawDeg * Math.PI / 180;
    const pitch = pitchDeg * Math.PI / 180;
    const planar = Math.cos(pitch);
    return {
        x: round(Math.sin(yaw) * planar),
        y: round(Math.sin(pitch)),
        z: round(Math.cos(yaw) * planar),
    };
}

function tileKey(tile) {
    return `${tile?.[0] ?? 0}:${tile?.[1] ?? 0}`;
}

function triadKey(tiles) {
    return tiles.map(tileKey).join('|');
}

function normalizeSelection(selection) {
    const weights = selection.weights.map((value) => round(value));
    return {
        layout: selection.layout,
        tiles: selection.tiles.map(([x, y]) => [x, y]),
        weights,
        weightsSum: round(weights.reduce((sum, value) => sum + value, 0)),
        dominantTile: selection.tiles[
            weights.reduce((best, value, index) => (value > weights[best] ? index : best), 0)
        ],
        uv: selection.uv ? {
            u: round(selection.uv.u),
            v: round(selection.uv.v),
        } : null,
    };
}

export function getDefaultImpostorOrbitPoses() {
    return DEFAULT_ORBIT_POSES.map((pose) => ({
        ...pose,
        direction: directionFromPose(pose),
    }));
}

export function selectImpostorTilesForLayout(layout, direction, sidecar = {}) {
    if (layout === 'octahedral') {
        return selectOctahedralImpostorTiles(direction, sidecar);
    }
    return selectLatLonHemiYImpostorTiles(direction, sidecar);
}

export function createImpostorOrbitLabReport({
    sidecar = {},
    poses = getDefaultImpostorOrbitPoses(),
    layouts = DEFAULT_LAYOUTS,
} = {}) {
    const layoutReports = {};
    for (const layout of layouts) {
        const samples = poses.map((pose) => {
            const direction = pose.direction ?? directionFromPose(pose);
            const selection = normalizeSelection(
                selectImpostorTilesForLayout(layout, direction, sidecar)
            );
            return {
                id: pose.id ?? `${pose.yawDeg ?? 0}-${pose.pitchDeg ?? 0}`,
                yawDeg: pose.yawDeg ?? null,
                pitchDeg: pose.pitchDeg ?? null,
                direction,
                selection,
            };
        });
        const uniqueTriads = new Set(samples.map((sample) => triadKey(sample.selection.tiles)));
        const uniqueDominantTiles = new Set(samples.map((sample) => tileKey(sample.selection.dominantTile)));
        const weightsNormalized = samples.every((sample) => Math.abs(sample.selection.weightsSum - 1) <= 0.001);
        layoutReports[layout] = {
            layout,
            sampleCount: samples.length,
            uniqueTriadCount: uniqueTriads.size,
            uniqueDominantTileCount: uniqueDominantTiles.size,
            weightsNormalized,
            samples,
        };
    }

    const sidecarLayout = [
        sidecar.layout ?? 'unknown',
        sidecar.axis ?? null,
    ].filter(Boolean).join('-');

    return {
        source: 'SDS WebGPU impostor orbit lab',
        sidecar: {
            layout: sidecar.layout ?? null,
            axis: sidecar.axis ?? null,
            hemi: sidecar.hemi ?? null,
            tilesX: sidecar.tilesX ?? null,
            tilesY: sidecar.tilesY ?? null,
            atlasWidth: sidecar.atlasWidth ?? null,
            atlasHeight: sidecar.atlasHeight ?? null,
            normalSpace: sidecar.normalSpace ?? null,
            auxLayers: sidecar.auxLayers ?? null,
        },
        sidecarLayout,
        productionReady: false,
        productionBlockers: [
            'per-instance camera-driven tile selection',
            'world-up-locked billboard projection',
            'depth/parallax discard parity',
            'terrain-grounded pivot integration',
            'LOD transition and culling integration',
        ],
        layouts: layoutReports,
        checks: {
            sidecarIsCurrentLatLonKiln: sidecarLayout === 'latlon-hemi-y',
            latLonTilesVary: (layoutReports['latlon-hemi-y']?.uniqueDominantTileCount ?? 0) >= 4,
            latLonWeightsNormalized: layoutReports['latlon-hemi-y']?.weightsNormalized === true,
            octahedralSelectorVary: (layoutReports.octahedral?.uniqueDominantTileCount ?? 0) >= 4,
            octahedralWeightsNormalized: layoutReports.octahedral?.weightsNormalized === true,
        },
    };
}
