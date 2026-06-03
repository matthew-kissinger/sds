// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

import {
    selectLatLonHemiYImpostorTiles,
    selectOctahedralImpostorTiles,
} from '../impostors/impostorTileSelection.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_RIGHT = new THREE.Vector3(1, 0, 0);
const scratchOrigin = new THREE.Vector3();
const scratchCamera = new THREE.Vector3();
const scratchView = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchUpSpherical = new THREE.Vector3();
const scratchUp = new THREE.Vector3();
const scratchZ = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const scratchHybridCamera = new THREE.Vector3();

function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function sidecarCenter(sidecar = {}) {
    const bbox = sidecar.bbox ?? {};
    const min = bbox.min ?? [0, 0, 0];
    const max = bbox.max ?? [0, 1, 0];
    return {
        x: (min[0] + max[0]) * 0.5,
        y: sidecar.yOffset ?? (min[1] + max[1]) * 0.5,
        z: (min[2] + max[2]) * 0.5,
    };
}

function offsetForTile([azIdx = 0, elIdx = 0], tilesX, tilesY) {
    return [
        azIdx / tilesX,
        (tilesY - 1 - elIdx) / tilesY,
    ];
}

function getSidecarLayout(sidecar = {}) {
    if (sidecar.layout === 'octahedral' || sidecar.axis === 'octahedral' || sidecar.directionEncoding === 'octahedral') {
        return 'octahedral';
    }
    if (sidecar.layout === 'latlon' && sidecar.axis === 'hemi-y') {
        return 'latlon-hemi-y';
    }
    return `${sidecar.layout ?? 'unknown'}-${sidecar.axis ?? 'unknown'}`;
}

function selectImpostorTiles(direction, sidecar = {}) {
    return getSidecarLayout(sidecar) === 'octahedral'
        ? selectOctahedralImpostorTiles(direction, sidecar)
        : selectLatLonHemiYImpostorTiles(direction, sidecar);
}

function buildInstanceState(inst, sidecar) {
    const center = sidecarCenter(sidecar);
    const rotationY = Number.isFinite(inst.rotation?.y) ? inst.rotation.y : 0;
    const scale = Number.isFinite(inst.scaleScalar)
        ? inst.scaleScalar
        : (Number.isFinite(inst.scale?.y) ? inst.scale.y : 1);
    return {
        baseX: inst.position?.x ?? 0,
        baseY: inst.position?.y ?? inst.groundY ?? 0,
        baseZ: inst.position?.z ?? 0,
        rotationY,
        sinY: Math.sin(rotationY),
        cosY: Math.cos(rotationY),
        scale,
        center,
    };
}

function writeSelectionAttributes(attributes, index, selection, tilesX, tilesY) {
    const offsets = [
        offsetForTile(selection.tiles[0], tilesX, tilesY),
        offsetForTile(selection.tiles[1], tilesX, tilesY),
        offsetForTile(selection.tiles[2], tilesX, tilesY),
    ];
    for (let i = 0; i < 3; i++) {
        attributes.tileOffsets[i].setXY(index, offsets[i][0], offsets[i][1]);
    }
    attributes.tileWeights.setXYZ(
        index,
        selection.weights[0] ?? 1,
        selection.weights[1] ?? 0,
        selection.weights[2] ?? 0,
    );
}

function computeOrigin(target, state) {
    const cx = state.center.x * state.scale;
    const cz = state.center.z * state.scale;
    target.set(
        state.baseX + (cx * state.cosY - cz * state.sinY),
        state.baseY + state.center.y * state.scale,
        state.baseZ + (cx * state.sinY + cz * state.cosY),
    );
    return target;
}

function worldToTreeDirection(target, cameraPosition, origin, state) {
    const dx = cameraPosition.x - origin.x;
    const dy = cameraPosition.y - origin.y;
    const dz = cameraPosition.z - origin.z;
    target.set(
        dx * state.cosY + dz * state.sinY,
        dy,
        -dx * state.sinY + dz * state.cosY,
    );
    if (target.lengthSq() < 1e-8) target.set(0, 0, 1);
    return target.normalize();
}

function writeBillboardMatrix(mesh, index, origin, cameraPosition, directionObj, scale) {
    scratchView.copy(cameraPosition).sub(origin);
    if (scratchView.lengthSq() < 1e-8) scratchView.set(0, 0, 1);
    scratchView.normalize();

    scratchRight.crossVectors(WORLD_UP, scratchView);
    if (scratchRight.lengthSq() < 1e-8) scratchRight.copy(FALLBACK_RIGHT);
    else scratchRight.normalize();

    scratchUpSpherical.crossVectors(scratchView, scratchRight).normalize();
    const pitchT = smoothstep(0.2, 0.7, Math.abs(directionObj.y));
    scratchUp.copy(WORLD_UP).lerp(scratchUpSpherical, pitchT).normalize();
    scratchZ.copy(scratchView).normalize();

    scratchRight.multiplyScalar(scale);
    scratchUp.multiplyScalar(scale);
    scratchZ.multiplyScalar(scale);
    scratchMatrix.makeBasis(scratchRight, scratchUp, scratchZ);
    scratchMatrix.setPosition(origin);
    mesh.setMatrixAt(index, scratchMatrix);
}

export function createKonveyorTreeImpostorGeometry(sourceGeometry, instances, sidecar = {}) {
    const geometry = sourceGeometry.clone();
    const count = instances.length;
    const attributes = {
        tileOffsets: [
            new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2),
            new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2),
            new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2),
        ],
        tileWeights: new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3),
    };

    for (const attr of [...attributes.tileOffsets, attributes.tileWeights]) {
        attr.setUsage(THREE.DynamicDrawUsage);
    }

    geometry.setAttribute('kilnTileOffset0', attributes.tileOffsets[0]);
    geometry.setAttribute('kilnTileOffset1', attributes.tileOffsets[1]);
    geometry.setAttribute('kilnTileOffset2', attributes.tileOffsets[2]);
    geometry.setAttribute('kilnTileWeights', attributes.tileWeights);

    return {
        geometry,
        attributes,
        states: instances.map((inst) => buildInstanceState(inst, sidecar)),
    };
}

export function installKonveyorTreeImpostorRuntime(mesh, {
    attributes,
    states,
    sidecar = {},
    treeType = 'unknown',
    chunkKey = '0:0',
} = {}) {
    const layout = getSidecarLayout(sidecar);
    mesh.userData.konveyorNativeTreeImpostor = {
        source: layout === 'octahedral' ? 'kiln-v2-octahedral-sidecar' : 'kiln-latlon-hemi-sidecar',
        treeType,
        chunkKey,
        version: sidecar.version ?? 1,
        layout,
        selection: 'camera-driven-per-instance-instanced-attributes',
        billboardProjection: 'cpu-world-up-locked-camera-facing',
        terrainGroundedPivots: true,
        tilesX: sidecar.tilesX ?? 4,
        tilesY: sidecar.tilesY ?? 4,
        count: states?.length ?? 0,
        syncCount: 0,
    };
    mesh.userData.konveyorTreeImpostorRuntime = {
        attributes,
        states,
        sidecar,
        layout,
    };
    return mesh.userData.konveyorNativeTreeImpostor;
}

export function installKonveyorTreeHybridRuntime(mesh, {
    role,
    chunkCenter,
    nearDistance = null,
    switchDistance = 200,
} = {}) {
    if (!role || !chunkCenter) return null;
    mesh.userData.konveyorNativeTreeHybrid = {
        role,
        chunkCenter: chunkCenter.clone ? chunkCenter.clone() : new THREE.Vector3(chunkCenter.x ?? 0, chunkCenter.y ?? 0, chunkCenter.z ?? 0),
        nearDistance: nearDistance ?? switchDistance,
        switchDistance,
    };
    mesh.visible = role === 'near-lod0';
    mesh.userData.konveyorNativeTreeHybrid.visible = mesh.visible;
    return mesh.userData.konveyorNativeTreeHybrid;
}

export function syncKonveyorTreeHybridVisibility(mesh, camera) {
    const hybrid = mesh?.userData?.konveyorNativeTreeHybrid;
    if (!hybrid || !camera?.position) return false;

    scratchHybridCamera.copy(camera.position);
    const distance = scratchHybridCamera.distanceTo(hybrid.chunkCenter);
    if (hybrid.role === 'near-lod0') {
        mesh.visible = distance < hybrid.nearDistance;
    } else if (hybrid.role === 'mid-lod1') {
        mesh.visible = distance >= hybrid.nearDistance && distance < hybrid.switchDistance;
    } else {
        mesh.visible = distance >= hybrid.switchDistance;
    }
    hybrid.lastDistance = +distance.toFixed(3);
    hybrid.visible = mesh.visible;
    return true;
}

export function syncKonveyorTreeImpostorMesh(mesh, camera) {
    const runtime = mesh?.userData?.konveyorTreeImpostorRuntime;
    if (!runtime || !camera?.position) return false;

    const { attributes, states, sidecar } = runtime;
    const tilesX = sidecar.tilesX ?? 4;
    const tilesY = sidecar.tilesY ?? 4;
    scratchCamera.copy(camera.position);
    let firstSelection = null;

    for (let i = 0; i < states.length; i++) {
        const state = states[i];
        const origin = computeOrigin(scratchOrigin, state);
        const directionObj = worldToTreeDirection(scratchView, scratchCamera, origin, state);
        const selection = selectImpostorTiles(directionObj, sidecar);
        if (!firstSelection) firstSelection = selection;
        writeSelectionAttributes(attributes, i, selection, tilesX, tilesY);
        writeBillboardMatrix(mesh, i, origin, scratchCamera, directionObj, state.scale);
    }

    for (const attr of [...attributes.tileOffsets, attributes.tileWeights]) {
        attr.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    const summary = mesh.userData.konveyorNativeTreeImpostor;
    if (summary) {
        summary.syncCount += 1;
        summary.lastCamera = [
            +scratchCamera.x.toFixed(3),
            +scratchCamera.y.toFixed(3),
            +scratchCamera.z.toFixed(3),
        ];
        if (firstSelection) {
            summary.lastSelectionLayout = firstSelection.layout;
            summary.lastDominantTiles = firstSelection.tiles;
        }
    }
    return true;
}

export function syncKonveyorTreeImpostorMeshes(trees, camera) {
    if (!Array.isArray(trees) || trees.length === 0) return 0;
    let synced = 0;
    for (const tree of trees) {
        syncKonveyorTreeHybridVisibility(tree, camera);
        if (syncKonveyorTreeImpostorMesh(tree, camera)) synced += 1;
    }
    return synced;
}
