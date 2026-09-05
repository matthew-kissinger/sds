// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { studioLayout } from '@app/camera/studioLayout';

describe('Studio preview composition', () => {
  it.each([[320,568],[390,844],[667,375],[844,390],[768,1024],[1440,900]])(
    'frames the subject in the unobstructed area at %ix%i', (width,height) => {
      const layout = studioLayout(width,height);
      expect(layout.viewWidth * layout.viewHeight / (width * height)).toBeGreaterThan(0.45);
      const camera = new THREE.PerspectiveCamera(38,width/height,0.1,1200);
      camera.position.set(0,0,5 * layout.distanceScale);
      camera.lookAt(0,0,0);
      camera.setViewOffset(width,height,layout.offsetX,layout.offsetY,width,height);
      camera.updateMatrixWorld(true);
      const center = new THREE.Vector3().project(camera);
      expect((center.x + 1) * width/2).toBeCloseTo(layout.left + layout.viewWidth/2);
      expect((1 - center.y) * height/2).toBeCloseTo(layout.top + layout.viewHeight/2);
      for (const x of [-1.8,1.8]) for (const y of [-1,1]) {
        const point = new THREE.Vector3(x,y,0).project(camera);
        const px = (point.x+1)*width/2, py=(1-point.y)*height/2;
        expect(px).toBeGreaterThan(layout.left);
        expect(px).toBeLessThan(width);
        expect(py).toBeGreaterThan(layout.top);
        expect(py).toBeLessThan(height-layout.bottomInset);
      }
    });
});
