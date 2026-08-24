// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../', import.meta.url));

function source(path: string): string {
  return readFileSync(`${repo}${path}`, 'utf8');
}

describe('3.0 launch client boundary', () => {
  it('exposes only the three solo flock sizes', () => {
    const store = source('app/src/state/store.ts');
    expect(store).toContain('readonly FlockSize[] = [25, 75, 200]');
    expect(store).not.toMatch(/startScaleGame|startMultiplayer|sessionKind|flockRuntime/);
  });

  it('keeps network, GPU scale, and diagnostic helpers out of the app entry graph', () => {
    for (const path of [
      'app/src/net',
      'app/src/sim-gpu',
      'app/src/ui/MultiplayerPanel.tsx',
      'app/src/ui/DebugReadout.tsx',
      'app/src/game/ScriptedDog.tsx',
      'app/src/game/tickDriver.ts',
      'worker/package.json',
    ]) expect(existsSync(`${repo}${path}`)).toBe(false);
    expect(source('app/src/App.tsx')).not.toMatch(
      /Multiplayer|RemoteDogs|ScriptedDog|DebugReadout|app\/src\/net|\.\/net\//,
    );
    expect(source('app/src/scene/FieldScene.tsx')).not.toMatch(/GpuFlock|sim-gpu/);
    expect(source('app/src/game/useGameLoop.ts')).not.toMatch(/tickDriver|multiplayer|debug=driver/);
  });

  it('keeps online times isolated from multiplayer and the game store', () => {
    const hud = source('app/src/ui/Hud.tsx');
    const controller = source('app/src/scores/controller.ts');
    const api = source('app/src/scores/api.ts');
    expect(hud).toContain('New personal best');
    expect(controller).toContain('useGameStore.subscribe');
    expect(api).toContain("sceneId: SCORE_SCENE_ID");
    expect(api).toContain("gameMode: 'soloClassic'");
    expect(`${controller}\n${api}`).not.toMatch(/WebSocket|roomCode|Play together/);
  });
});
