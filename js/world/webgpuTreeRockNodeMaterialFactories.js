// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createWebGpuRockRimNodeMaterial } from './webgpuRockRimNodeMaterial.js';
import { createWebGpuTreeBranchNodeMaterial } from './webgpuTreeBranchNodeMaterial.js';
import { createWebGpuTreeLeafNodeMaterial } from './webgpuTreeLeafNodeMaterial.js';

const DEFAULT_TREE_LEAF = Object.freeze({
  baseColor: [0.18, 0.34, 0.12],
  tipColor: [0.5, 0.68, 0.24],
  windDirection: [0.7, 0.7],
  windStrength: 0.38,
  treeBaseY: -0.525,
  treeTopY: 0.525,
  occluderStrength: 0.55,
  occluderPeak: 0.62,
  occluderUv: [0.5, 0.42],
  sourceMapScale: 0.58,
  alphaHash: true,
  alphaTest: 0.08,
});

const COMMON_POSTURE = Object.freeze(['side', 'transparent', 'depthWrite', 'depthTest']);
const LEAF_POSTURE = Object.freeze([...COMMON_POSTURE, 'alphaHash', 'alphaTest']);
const DEFAULT_TREE_BRANCH_WIND = Object.freeze({
  windDirection: [0.7, 0.7],
  windStrength: 0.38,
  treeBaseY: -0.525,
  treeTopY: 0.525,
});

function previousColor(previous) {
  return previous?.color?.toArray?.().slice(0, 3) ?? null;
}

function mergePosture(defaults, previous, keys) {
  const result = { ...defaults };
  for (const key of keys) {
    if (previous?.[key] !== undefined) {
      result[key] = previous[key];
    }
  }
  return result;
}

function mergeBranchMaterial(defaults, previous) {
  const result = mergePosture(defaults, previous, COMMON_POSTURE);
  const color = previousColor(previous);
  if (color) {
    result.baseColor = color;
    result.baseColorLinear = true;
  }
  if (previous?.roughness !== undefined) result.roughness = previous.roughness;
  if (previous?.metalness !== undefined) result.metalness = previous.metalness;
  return result;
}

function mergeLeafMaterial(defaults, previous) {
  const result = mergePosture(defaults, previous, LEAF_POSTURE);
  const color = previousColor(previous);
  if (color) {
    result.tintColor = color;
    result.tintColorLinear = true;
  }
  if (previous?.map) result.map = previous.map;
  if (previous?.roughness !== undefined) result.roughness = previous.roughness;
  if (previous?.metalness !== undefined) result.metalness = previous.metalness;
  return result;
}

export function createWebGpuTreeRockNodeMaterialFactories(webGpuModules, options = {}) {
  const treeBranch = options.treeBranch ?? {};
  const treeLeaf = {
    ...DEFAULT_TREE_LEAF,
    ...(options.treeLeaf ?? {}),
  };
  const rockRim = options.rockRim ?? {};

  return {
    createTreeBranchMaterial: ({ previous } = {}) =>
      createWebGpuTreeBranchNodeMaterial(
        webGpuModules,
        mergeBranchMaterial({ ...DEFAULT_TREE_BRANCH_WIND, ...treeBranch }, previous)
      ),
    createTreeLeafMaterial: ({ previous } = {}) =>
      createWebGpuTreeLeafNodeMaterial(
        webGpuModules,
        mergeLeafMaterial(treeLeaf, previous)
      ),
    createRockMaterial: ({ previous } = {}) =>
      createWebGpuRockRimNodeMaterial(
        webGpuModules,
        mergePosture(rockRim, previous, COMMON_POSTURE)
      ),
  };
}
