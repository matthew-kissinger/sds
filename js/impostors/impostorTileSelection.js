const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeDirection(direction) {
    const x = Number(direction?.x) || 0;
    const y = Number(direction?.y) || 0;
    const z = Number(direction?.z) || 0;
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) return { x: 0, y: 0, z: 1 };
    return { x: x / length, y: y / length, z: z / length };
}

function elevationCell(elevation, elevations) {
    const rows = elevations.length;
    if (rows < 2) return { row: 0, v: 0 };
    if (elevation >= elevations[0]) return { row: 0, v: 0 };
    for (let i = 0; i < rows - 1; i++) {
        const hi = elevations[i];
        const lo = elevations[i + 1];
        if (elevation >= lo) {
            return {
                row: i,
                v: clamp((hi - elevation) / Math.max(1e-6, hi - lo), 0, 1),
            };
        }
    }
    return { row: rows - 2, v: 1 };
}

function normalizeWeights(weights) {
    const sum = weights.reduce((total, value) => total + value, 0);
    if (sum <= 1e-6) return [1, 0, 0];
    return weights.map((value) => value / sum);
}

export function selectLatLonHemiYImpostorTiles(direction, sidecar = {}) {
    const dir = normalizeDirection(direction);
    const tilesX = sidecar.tilesX ?? 4;
    const tilesY = sidecar.tilesY ?? 4;
    const elevations = Array.isArray(sidecar.elevations) && sidecar.elevations.length >= 2
        ? sidecar.elevations
        : [Math.PI * 0.35, Math.PI * 0.2, Math.PI * 0.05, -Math.PI * 0.1];

    let azimuth = Math.atan2(dir.z, dir.x);
    if (azimuth < 0) azimuth += TWO_PI;
    const azFloat = azimuth / (TWO_PI / tilesX);
    const az0 = Math.floor(azFloat) % tilesX;
    const az1 = (az0 + 1) % tilesX;
    const u = azFloat - Math.floor(azFloat);
    const elevation = clamp(Math.asin(clamp(dir.y, -1, 1)), 0, Math.PI * 0.5);
    const { row, v } = elevationCell(elevation, elevations.slice(0, tilesY));

    let tiles;
    let weights;
    if (u + v < 1) {
        tiles = [[az0, row], [az1, row], [az0, row + 1]];
        weights = [1 - u - v, u, v];
    } else {
        tiles = [[az1, row], [az1, row + 1], [az0, row + 1]];
        weights = [1 - v, u + v - 1, 1 - u];
    }

    return {
        layout: 'latlon-hemi-y',
        tiles: tiles.map(([az, el]) => [
            ((az % tilesX) + tilesX) % tilesX,
            clamp(el, 0, tilesY - 1),
        ]),
        weights: normalizeWeights(weights),
        uv: { u, v },
        azimuth,
        elevation,
    };
}

export function selectOctahedralImpostorTiles(direction, sidecar = {}) {
    const dir = normalizeDirection(direction);
    const tilesX = sidecar.tilesX ?? 4;
    const tilesY = sidecar.tilesY ?? 4;
    const denom = Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z);
    let ox = denom > 1e-6 ? dir.x / denom : 0;
    let oy = denom > 1e-6 ? dir.z / denom : 0;
    if (dir.y < 0) {
        const oldX = ox;
        ox = (1 - Math.abs(oy)) * Math.sign(oldX || 1);
        oy = (1 - Math.abs(oldX)) * Math.sign(oy || 1);
    }
    const gridX = clamp((ox * 0.5 + 0.5) * (tilesX - 1), 0, tilesX - 1);
    const gridY = clamp((0.5 - oy * 0.5) * (tilesY - 1), 0, tilesY - 1);
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const x1 = Math.min(tilesX - 1, x0 + 1);
    const y1 = Math.min(tilesY - 1, y0 + 1);
    const u = gridX - x0;
    const v = gridY - y0;
    const tiles = u + v < 1
        ? [[x0, y0], [x1, y0], [x0, y1]]
        : [[x1, y0], [x1, y1], [x0, y1]];
    const weights = u + v < 1
        ? [1 - u - v, u, v]
        : [1 - v, u + v - 1, 1 - u];
    return {
        layout: 'octahedral',
        tiles,
        weights: normalizeWeights(weights),
        uv: { u, v },
    };
}
