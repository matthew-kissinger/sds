// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P3-MP-COORD: MultiplayerCoordinator unit suite.
 *
 * Constructs the coordinator with mocked dependencies (no Three.js, no
 * booted game) and locks the three behaviors the extraction moved out of
 * main.js verbatim:
 *   - updateOtherPlayer creates/updates a remote dog (on-demand rig load
 *     deferral, racing icon assignment, interpolation targets, the
 *     8-frame stop blend window);
 *   - removeOtherPlayer disposes the dog (icon, scene mesh, map entry);
 *   - reconcileWithServerState applies a server snapshot to local state
 *     (snap beyond 8m, adaptive lerp in between, sprint-aware threshold,
 *     authoritative stamina/sprint).
 *
 * Snapshot shapes mirror the server `sheepdogs` records the client consumes
 * in boot/initNetwork.js (the same records the delta path reconstructs in
 * tests/delta-client-reconstruction.spec.ts): { playerId, x, z, rotation,
 * vx, vz, sprinting, stamina, interpolatingToClient }.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiplayerCoordinator } from '../js/multiplayer/MultiplayerCoordinator.js';
import { Vector2D } from '../js/Vector2D.js';

function makeFakeDog(x: number, z: number, dogType: string) {
  const dog: any = {
    dogType,
    position: { x, z },
    velocity: new Vector2D(0, 0),
    isSprinting: false,
    isMoving: false,
    mesh: null,
    targetPosition: null,
    targetRotation: 0,
    setMultiplayerSpeeds: vi.fn(),
    setPlayerInfo: vi.fn(),
    removePlayerIcon: vi.fn(),
  };
  dog.createMesh = vi.fn(() => {
    dog.mesh = { position: { x, y: 0, z } };
    return dog.mesh;
  });
  return dog;
}

// Server sheepdog record as consumed by updateOtherPlayer (initNetwork.js
// forwards each non-local record from serverState.sheepdogs verbatim).
function dogData(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 'p2',
    dogType: 'jep',
    x: 10,
    z: -5,
    rotation: 1.25,
    vx: 2,
    vz: 0,
    sprinting: false,
    interpolatingToClient: false,
    ...overrides,
  };
}

function makeHarness({ modelsReady = true } = {}) {
  // Plain-object game facade mirroring the members the coordinator reads
  // off the live game instance (see the module doc).
  const game: any = {
    otherPlayers: new Map<string, any>(),
    sceneManager: { add: vi.fn(), remove: vi.fn() },
    terrainBuilder: {
      models: { animals: (modelsReady ? { jep: {}, pip: {} } : {}) as Record<string, object> },
      loadAnimal: vi.fn(() => Promise.resolve()),
    },
    gameState: { gameMode: 'cooperative', competitiveGates: null },
    networkManager: { lastServerState: null, getPlayerId: () => 'me' },
    sheepdog: {
      position: { x: 0, z: 0 },
      velocity: new Vector2D(0, 0),
      isSprinting: false,
      stamina: 100,
      mesh: { position: { x: 0, y: 0, z: 0 } },
    },
    serverDogPosition: { x: 0, z: 0 },
    interpolationSpeed: 2.5,
  };
  const created: any[] = [];
  const createRemoteDog = vi.fn((x: number, z: number, dogType: string) => {
    const dog = makeFakeDog(x, z, dogType);
    created.push(dog);
    return dog;
  });
  const coordinator = new MultiplayerCoordinator(game, createRemoteDog);
  return {
    coordinator, game, created, createRemoteDog,
    otherPlayers: game.otherPlayers,
    sceneManager: game.sceneManager,
    terrainBuilder: game.terrainBuilder,
    gameState: game.gameState,
    networkManager: game.networkManager,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateOtherPlayer', () => {
  it('creates a remote dog for a new player and registers it', () => {
    const h = makeHarness();
    h.coordinator.updateOtherPlayer(dogData());

    expect(h.createRemoteDog).toHaveBeenCalledWith(10, -5, 'jep');
    const dog = h.otherPlayers.get('p2');
    expect(dog).toBe(h.created[0]);
    expect(dog.setMultiplayerSpeeds).toHaveBeenCalledWith(true);
    expect(dog.createMesh).toHaveBeenCalledOnce();
    expect(h.sceneManager.add).toHaveBeenCalledWith(dog.mesh);
    // Interpolation targets + animation-driving state from the record.
    expect(dog.targetPosition.x).toBe(10);
    expect(dog.targetPosition.z).toBe(-5);
    expect(dog.targetRotation).toBe(1.25);
    expect(dog.velocity.x).toBe(2);
    expect(dog.isSprinting).toBe(false);
    expect(dog.isMoving).toBe(true); // |(2,0)| > 0.5
  });

  it('falls back to the jep rig when the record carries no dogType', () => {
    const h = makeHarness();
    h.coordinator.updateOtherPlayer(dogData({ dogType: undefined }));
    expect(h.createRemoteDog).toHaveBeenCalledWith(10, -5, 'jep');
  });

  it('assigns the racing gate color to a new remote dog', () => {
    const h = makeHarness();
    h.gameState.gameMode = 'racing';
    h.gameState.competitiveGates = [{ playerId: 'p2', color: 0xff0000 }];
    h.coordinator.updateOtherPlayer(dogData());
    expect(h.otherPlayers.get('p2').setPlayerInfo).toHaveBeenCalledWith('p2', 0xff0000);
  });

  it('defers creation while the rig loads, guarding duplicate loads per player', async () => {
    const h = makeHarness({ modelsReady: false });
    h.coordinator.updateOtherPlayer(dogData({ dogType: 'pip' }));
    h.coordinator.updateOtherPlayer(dogData({ dogType: 'pip' }));

    // No dog yet; exactly one load kicked despite two server ticks.
    expect(h.otherPlayers.size).toBe(0);
    expect(h.createRemoteDog).not.toHaveBeenCalled();
    expect(h.terrainBuilder.loadAnimal).toHaveBeenCalledOnce();
    expect(h.terrainBuilder.loadAnimal).toHaveBeenCalledWith('pip');

    // Once the model arrives, the next tick constructs the dog.
    await Promise.resolve(); // let .finally() clear the per-player guard
    h.terrainBuilder.models.animals.pip = {};
    h.coordinator.updateOtherPlayer(dogData({ dogType: 'pip' }));
    expect(h.otherPlayers.get('p2').dogType).toBe('pip');
  });

  it('updates an existing dog in place without re-creating it', () => {
    const h = makeHarness();
    h.coordinator.updateOtherPlayer(dogData());
    h.coordinator.updateOtherPlayer(dogData({ x: 12, z: -7, rotation: 2.5, vx: 0, vz: 0.2, sprinting: true }));

    expect(h.createRemoteDog).toHaveBeenCalledOnce();
    const dog = h.otherPlayers.get('p2');
    expect(dog.targetPosition.x).toBe(12);
    expect(dog.targetPosition.z).toBe(-7);
    expect(dog.targetRotation).toBe(2.5);
    expect(dog.isSprinting).toBe(true);
    expect(dog.isMoving).toBe(false); // |(0,0.2)| <= 0.5
  });

  it('opens an 8-frame blend window on interpolatingToClient and clears it when the flag drops', () => {
    const h = makeHarness();
    h.coordinator.updateOtherPlayer(dogData());
    const dog = h.otherPlayers.get('p2');
    dog.position.x = 3;
    dog.position.z = 4;

    h.coordinator.updateOtherPlayer(dogData({ x: 11, z: -6, interpolatingToClient: true }));
    expect(dog._blendFramesRemaining).toBe(8);
    expect(dog._blendTotalFrames).toBe(8);
    expect(dog._blendStartPos).toEqual({ x: 3, z: 4 });

    // While active, another interpolating update keeps the running blend.
    dog._blendFramesRemaining = 5;
    h.coordinator.updateOtherPlayer(dogData({ x: 11.5, z: -6, interpolatingToClient: true }));
    expect(dog._blendFramesRemaining).toBe(5);
    expect(dog._blendStartPos).toEqual({ x: 3, z: 4 });

    // Server resumed normal updates: blend state drops.
    h.coordinator.updateOtherPlayer(dogData({ x: 12, z: -6 }));
    expect(dog._blendFramesRemaining).toBe(0);
  });
});

describe('removeOtherPlayer', () => {
  it('disposes the remote dog: icon, scene mesh, map entry', () => {
    const h = makeHarness();
    h.coordinator.updateOtherPlayer(dogData());
    const dog = h.otherPlayers.get('p2');

    h.coordinator.removeOtherPlayer('p2');
    expect(dog.removePlayerIcon).toHaveBeenCalledOnce();
    expect(h.sceneManager.remove).toHaveBeenCalledWith(dog.mesh);
    expect(h.otherPlayers.has('p2')).toBe(false);
  });

  it('is a no-op for an unknown player id', () => {
    const h = makeHarness();
    h.coordinator.removeOtherPlayer('ghost');
    expect(h.sceneManager.remove).not.toHaveBeenCalled();
  });
});

describe('getServerSprintState', () => {
  it('returns the local player record sprinting flag from lastServerState', () => {
    const h = makeHarness();
    h.networkManager.lastServerState = {
      sheepdogs: [
        { playerId: 'p2', sprinting: false },
        { playerId: 'me', sprinting: true },
      ],
    };
    expect(h.coordinator.getServerSprintState()).toBe(true);
  });

  it('returns null when there is no server state or no own record', () => {
    const h = makeHarness();
    expect(h.coordinator.getServerSprintState()).toBeNull();
    h.networkManager.lastServerState = { sheepdogs: [{ playerId: 'p2', sprinting: true }] };
    expect(h.coordinator.getServerSprintState()).toBeNull();
  });
});

describe('reconcileWithServerState', () => {
  it('snaps to the server position beyond 8m and applies authoritative stamina + sprint', () => {
    const h = makeHarness();
    h.game.serverDogPosition = { x: 20, z: 0 };
    h.networkManager.lastServerState = {
      sheepdogs: [{ playerId: 'me', x: 20, z: 0, sprinting: true, stamina: 42 }],
    };

    h.coordinator.reconcileWithServerState(0.016);
    expect(h.game.sheepdog.position).toEqual({ x: 20, z: 0 });
    expect(h.game.sheepdog.mesh.position.x).toBe(20);
    expect(h.game.sheepdog.mesh.position.z).toBe(0);
    expect(h.game.sheepdog.stamina).toBe(42);
    expect(h.game.sheepdog.isSprinting).toBe(true);
  });

  it('lerps toward the server position for a mid-range error', () => {
    const h = makeHarness();
    h.game.serverDogPosition = { x: 1, z: 0 };

    h.coordinator.reconcileWithServerState(0.016);
    // Stopped dog, no sprint mismatch: base 2.5*3, scale 1+min(1/2,1)=1.5,
    // factor min(7.5*1.5*0.016, 0.5) = 0.18 toward the 1m offset.
    expect(h.game.sheepdog.position.x).toBeCloseTo(0.18, 10);
    expect(h.game.sheepdog.position.z).toBeCloseTo(0, 10);
    expect(h.game.sheepdog.mesh.position.x).toBeCloseTo(0.18, 10);
  });

  it('leaves position untouched under the reconciliation threshold', () => {
    const h = makeHarness();
    h.game.serverDogPosition = { x: 0.01, z: 0 };
    h.coordinator.reconcileWithServerState(0.016);
    expect(h.game.sheepdog.position).toEqual({ x: 0, z: 0 });
    expect(h.game.sheepdog.mesh.position.x).toBe(0);
  });

  it('widens the threshold on a sprint mismatch instead of correcting', () => {
    const h = makeHarness();
    // 0.1m error: above the 0.05 normal threshold, below the 0.2 mismatch one.
    h.game.serverDogPosition = { x: 0.1, z: 0 };
    h.game.sheepdog.isSprinting = false;
    h.networkManager.lastServerState = {
      sheepdogs: [{ playerId: 'me', sprinting: true }],
    };
    h.coordinator.reconcileWithServerState(0.016);
    expect(h.game.sheepdog.position.x).toBe(0);
    // Authoritative sprint still applies.
    expect(h.game.sheepdog.isSprinting).toBe(true);
  });

  it('bails when there is no local dog or no server position yet', () => {
    const h = makeHarness();
    h.game.sheepdog = null;
    expect(() => h.coordinator.reconcileWithServerState(0.016)).not.toThrow();

    const h2 = makeHarness();
    h2.game.serverDogPosition = { z: 5 }; // x undefined: pre-first-broadcast shape
    h2.coordinator.reconcileWithServerState(0.016);
    expect(h2.game.sheepdog.position).toEqual({ x: 0, z: 0 });
  });
});
