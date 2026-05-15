import { createKonveyorPortalRingNodeMaterial } from './konveyorPortalNodeMaterial.js';
import { createKonveyorSunBillboardNodeMaterial } from './konveyorSunNodeMaterial.js';

function mergeDefined(defaults, context, keys) {
  const result = { ...defaults };
  for (const key of keys) {
    if (context?.[key] !== undefined) {
      result[key] = context[key];
    }
  }
  return result;
}

export function createKonveyorEffectNodeMaterialFactories(webGpuModules, options = {}) {
  const sun = options.sun ?? {};
  const portal = options.portal ?? {};

  return {
    createSunBillboardMaterial: (context = {}) =>
      createKonveyorSunBillboardNodeMaterial(
        webGpuModules,
        mergeDefined(sun, context, ['depthTest', 'blending'])
      ),
    createPortalRingMaterial: (context = {}) =>
      createKonveyorPortalRingNodeMaterial(
        webGpuModules,
        mergeDefined(portal, context, ['depthTest', 'side', 'blending'])
      ),
  };
}
