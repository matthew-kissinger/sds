import { createKonveyorRockRimNodeMaterial } from './konveyorRockRimNodeMaterial.js';
import { createKonveyorTreeBranchNodeMaterial } from './konveyorTreeBranchNodeMaterial.js';
import { createKonveyorTreeLeafNodeMaterial } from './konveyorTreeLeafNodeMaterial.js';

const DEFAULT_TREE_LEAF = Object.freeze({
  baseColor: [0.18, 0.34, 0.12],
  tipColor: [0.5, 0.68, 0.24],
  windDirection: [0.7, 0.7],
  windStrength: 0.72,
  treeBaseY: -0.525,
  treeTopY: 0.525,
  occluderStrength: 0.55,
  occluderPeak: 0.62,
  occluderUv: [0.5, 0.42],
  alphaHash: true,
  alphaTest: 0.08,
});

const COMMON_POSTURE = Object.freeze(['side', 'transparent', 'depthWrite', 'depthTest']);
const LEAF_POSTURE = Object.freeze([...COMMON_POSTURE, 'alphaHash', 'alphaTest']);

function mergePosture(defaults, previous, keys) {
  const result = { ...defaults };
  for (const key of keys) {
    if (previous?.[key] !== undefined) {
      result[key] = previous[key];
    }
  }
  return result;
}

export function createKonveyorTreeRockNodeMaterialFactories(webGpuModules, options = {}) {
  const treeBranch = options.treeBranch ?? {};
  const treeLeaf = {
    ...DEFAULT_TREE_LEAF,
    ...(options.treeLeaf ?? {}),
  };
  const rockRim = options.rockRim ?? {};

  return {
    createTreeBranchMaterial: ({ previous } = {}) =>
      createKonveyorTreeBranchNodeMaterial(
        webGpuModules,
        mergePosture(treeBranch, previous, COMMON_POSTURE)
      ),
    createTreeLeafMaterial: ({ previous } = {}) =>
      createKonveyorTreeLeafNodeMaterial(
        webGpuModules,
        mergePosture(treeLeaf, previous, LEAF_POSTURE)
      ),
    createRockMaterial: ({ previous } = {}) =>
      createKonveyorRockRimNodeMaterial(
        webGpuModules,
        mergePosture(rockRim, previous, COMMON_POSTURE)
      ),
  };
}
