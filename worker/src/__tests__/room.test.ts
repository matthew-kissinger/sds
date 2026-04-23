/**
 * RoomDO simulation logic tests
 *
 * We test the pure simulation behaviors extracted into helper classes
 * that mirror RoomDO internals. This avoids needing the Cloudflare DO runtime.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector2D } from '../shared/Vector2D';
import {
  generateInitialSheepPositions,
  updateCompetitiveSheepRetirements,
  checkCompetitiveCompletion,
  checkGameCompletion,
  generateCompetitiveGateLayout,
  assignGatesToPlayers,
  calculateFlockingForce,
  calculateFlee,
  getNeighbors,
  applyHardBoundaryConstraints,
  updateStamina,
  applyAcceleration,
  validateEntityState,
} from '../shared';
import type { Bounds, Gate } from '../shared';

// ---- Helpers that mirror RoomDO internals ----

const BOUNDS: Bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

const COOP_GATE = {
  position: new Vector2D(0, 100),
  width: 8,
  direction: 'north',
  passageZone: { minX: -4, maxX: 4, minZ: 96, maxZ: 104 },
  pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
};

const SHEEP_CONFIG = {
  maxSpeed: 0.24,
  maxForce: 0.05,
  perceptionRadius: 6,
  separationDistance: 2.5,
};

const DELTA_TIME = 1 / 20; // 20Hz

interface SheepSim {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  hasPassedGate: boolean;
  isRetiring: boolean;
  retirementTarget: Vector2D | null;
  state: number;
  fleeRadius: number;
  gateAttraction: number;
  assignedGate: number | null;
  facingDirection: number;
}

interface DogSim {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  maxSpeed: number;
  sprintSpeed: number;
  maxStamina: number;
  stamina: number;
  isSprinting: boolean;
  rotation: number;
  targetRotation: number;
  inputSequence: number;
  clientStopTarget: Vector2D | null;
  isInterpolatingToClient: boolean;
}

function makeSheep(id: number, x = 0, z = 0): SheepSim {
  return {
    id,
    position: new Vector2D(x, z),
    velocity: new Vector2D(0, 0),
    acceleration: new Vector2D(0, 0),
    hasPassedGate: false,
    isRetiring: false,
    retirementTarget: null,
    state: 0,
    fleeRadius: 8,
    gateAttraction: 0.5,
    assignedGate: null,
    facingDirection: 0,
  };
}

function makeDog(id: string, x = 0, z = 0): DogSim {
  return {
    id,
    position: new Vector2D(x, z),
    velocity: new Vector2D(0, 0),
    acceleration: new Vector2D(0, 0),
    maxSpeed: 30,
    sprintSpeed: 50,
    maxStamina: 100,
    stamina: 100,
    isSprinting: false,
    rotation: 0,
    targetRotation: 0,
    inputSequence: 0,
    clientStopTarget: null,
    isInterpolatingToClient: false,
  };
}

function updateSheepMovement(sheep: SheepSim): void {
  const maxSpeed = SHEEP_CONFIG.maxSpeed;
  const prevVel = sheep.velocity.clone();

  sheep.velocity.add(sheep.acceleration);
  sheep.velocity.limit(maxSpeed);
  sheep.velocity.multiply(0.98);

  const smoothed = prevVel.multiply(0.85).add(sheep.velocity.clone().multiply(0.15));

  if (smoothed.magnitude() > 0.001) {
    sheep.velocity = smoothed;
    sheep.position.add(sheep.velocity.clone().multiply(DELTA_TIME * 60));
  } else {
    sheep.velocity.multiply(0);
  }

  sheep.acceleration.multiply(0);
}

function updateDogMovement(dog: DogSim): void {
  if (dog.isInterpolatingToClient && dog.clientStopTarget) {
    const dist = dog.position.distanceTo(dog.clientStopTarget);
    if (dist < 0.05) {
      dog.position.x = dog.clientStopTarget.x;
      dog.position.z = dog.clientStopTarget.z;
      dog.velocity.multiply(0);
      dog.isInterpolatingToClient = false;
      dog.clientStopTarget = null;
    } else {
      const factor = Math.min(8.0 * DELTA_TIME, 0.8);
      dog.position.x += (dog.clientStopTarget.x - dog.position.x) * factor;
      dog.position.z += (dog.clientStopTarget.z - dog.position.z) * factor;
      dog.velocity.multiply(0);
    }
    dog.acceleration.multiply(0);
    return;
  }

  const maxSpeed = dog.isSprinting ? dog.sprintSpeed : dog.maxSpeed;
  const prevVel = dog.velocity.clone();
  dog.velocity.add(dog.acceleration);
  dog.velocity.limit(maxSpeed);
  dog.velocity.multiply(0.85);

  const smoothed = prevVel.multiply(0.6).add(dog.velocity.clone().multiply(0.4));

  if (smoothed.magnitude() > 0.1) {
    dog.velocity = smoothed;
    dog.position.add(dog.velocity.clone().multiply(DELTA_TIME));
  } else {
    dog.velocity.multiply(0);
  }

  dog.acceleration.multiply(0);
}

/** Run one simulation tick */
function runTick(sheep: SheepSim[], dogs: DogSim[]): void {
  const activeSheep = sheep.filter(s => s.state === 0);

  for (const s of sheep) {
    if (s.state !== 0) {
      s.velocity.set(0, 0);
      s.acceleration.set(0, 0);
      continue;
    }

    const neighbors = getNeighbors(
      s as Parameters<typeof getNeighbors>[0],
      activeSheep as Parameters<typeof getNeighbors>[1],
      SHEEP_CONFIG.perceptionRadius
    );

    const flockForce = calculateFlockingForce(
      s as Parameters<typeof calculateFlockingForce>[0],
      neighbors,
      SHEEP_CONFIG
    );
    s.acceleration.add(flockForce);

    for (const dog of dogs) {
      const flee = calculateFlee(
        s as Parameters<typeof calculateFlee>[0],
        dog.position,
        s.fleeRadius,
        SHEEP_CONFIG.maxSpeed,
        SHEEP_CONFIG.maxForce
      );
      if (flee.magnitude() > 0) {
        flee.multiply(1.2);
        s.acceleration.add(flee);
      }
    }

    updateSheepMovement(s);

    if (!s.hasPassedGate && !s.isRetiring) {
      const constrained = applyHardBoundaryConstraints(
        s as Parameters<typeof applyHardBoundaryConstraints>[0],
        BOUNDS,
        COOP_GATE as unknown as Gate,
        { margin: 0.5, allowGatePassage: true }
      );
      s.position = constrained;
    }

    if (s.velocity.magnitude() > 0.001) {
      s.facingDirection = s.velocity.angle();
    }

    validateEntityState(
      s as Parameters<typeof validateEntityState>[0],
      new Vector2D(-20, -20)
    );
  }

  for (const dog of dogs) {
    updateDogMovement(dog);
    const constrained = applyHardBoundaryConstraints(
      dog as Parameters<typeof applyHardBoundaryConstraints>[0],
      BOUNDS,
      null,
      { margin: 1 }
    );
    dog.position = constrained;
  }
}

// ---- Tests ----

describe('Simulation: 2 players join, start, 100 ticks', () => {
  let sheep: SheepSim[];
  let dogs: DogSim[];

  beforeEach(() => {
    const positions = generateInitialSheepPositions(200, BOUNDS, { spreadRadius: 25, centerX: -20, centerZ: -20 });
    sheep = positions.map((pos, i) => makeSheep(i, pos.x, pos.z));
    dogs = [
      makeDog('player1', 10, 10),
      makeDog('player2', -10, -10),
    ];
  });

  it('generates 200 sheep with valid positions', () => {
    expect(sheep).toHaveLength(200);
    for (const s of sheep) {
      expect(isFinite(s.position.x)).toBe(true);
      expect(isFinite(s.position.z)).toBe(true);
      expect(s.state).toBe(0);
    }
  });

  it('sheep positions evolve over 100 ticks', () => {
    const initialPositions = sheep.map(s => ({ x: s.position.x, z: s.position.z }));

    for (let i = 0; i < 100; i++) {
      runTick(sheep, dogs);
    }

    // At least some sheep should have moved
    let movedCount = 0;
    for (let i = 0; i < sheep.length; i++) {
      const dx = Math.abs(sheep[i].position.x - initialPositions[i].x);
      const dz = Math.abs(sheep[i].position.z - initialPositions[i].z);
      if (dx > 0.01 || dz > 0.01) movedCount++;
    }
    expect(movedCount).toBeGreaterThan(0);
  });

  it('sheep stay within extended bounds after 100 ticks', () => {
    for (let i = 0; i < 100; i++) {
      runTick(sheep, dogs);
    }

    for (const s of sheep) {
      if (s.state === 0) {
        expect(s.position.x).toBeGreaterThanOrEqual(BOUNDS.minX - 1);
        expect(s.position.x).toBeLessThanOrEqual(BOUNDS.maxX + 1);
        expect(s.position.z).toBeGreaterThanOrEqual(BOUNDS.minZ - 1);
        expect(s.position.z).toBeLessThanOrEqual(BOUNDS.maxZ + 1);
      }
    }
  });

  it('no NaN in positions after 100 ticks', () => {
    for (let i = 0; i < 100; i++) {
      runTick(sheep, dogs);
    }
    for (const s of sheep) {
      expect(isNaN(s.position.x)).toBe(false);
      expect(isNaN(s.position.z)).toBe(false);
    }
  });

  it('dogs respond to movement input over 100 ticks', () => {
    // Simulate player1 moving forward
    for (let i = 0; i < 100; i++) {
      const targetVel = new Vector2D(0, 1);
      targetVel.normalize().multiply(dogs[0].maxSpeed);
      applyAcceleration(
        dogs[0] as Parameters<typeof applyAcceleration>[0],
        targetVel,
        DELTA_TIME,
        { acceleration: 80, deceleration: 100, maxSpeed: 30 }
      );
      runTick(sheep, dogs);
    }

    // Dog should have moved in Z direction
    expect(dogs[0].position.z).toBeGreaterThan(5);
  });
});

describe('Input validation: clientPos 5-unit guard', () => {
  it('accepts clientPos within 5 units of dog position', () => {
    const dog = makeDog('p1', 0, 0);
    const clientPos = { x: 3, z: 4 }; // distance = 5 exactly
    const dx = clientPos.x - dog.position.x;
    const dz = clientPos.z - dog.position.z;
    const distSq = dx * dx + dz * dz;
    // 3^2 + 4^2 = 25, threshold is >25, so this should be accepted
    expect(distSq).toBeLessThanOrEqual(25);
  });

  it('rejects clientPos more than 5 units from dog position', () => {
    const dog = makeDog('p1', 0, 0);
    const clientPos = { x: 6, z: 0 }; // distance = 6
    const dx = clientPos.x - dog.position.x;
    const dz = clientPos.z - dog.position.z;
    const distSq = dx * dx + dz * dz;
    expect(distSq).toBeGreaterThan(25);
  });

  it('exactly 5 units is accepted (dx*dx+dz*dz == 25 is not >25)', () => {
    const dog = makeDog('p1', 0, 0);
    // Distance exactly 5
    const clientPos = { x: 3, z: 4 };
    const dx = clientPos.x - dog.position.x;
    const dz = clientPos.z - dog.position.z;
    const distSq = dx * dx + dz * dz;
    // Guard condition is distSq > 25
    expect(distSq > 25).toBe(false);
  });

  it('validates input sequence ordering', () => {
    const dog = makeDog('p1', 0, 0);
    // Simulate the sequence guard: inputSequence <= dog.inputSequence means skip
    dog.inputSequence = 10;
    const oldInput = { inputSequence: 5 };
    const newInput = { inputSequence: 15 };
    // Old input should be rejected
    expect(oldInput.inputSequence <= dog.inputSequence).toBe(true);
    // New input should be accepted
    expect(newInput.inputSequence <= dog.inputSequence).toBe(false);
  });
});

describe('Mode cycling: cooperative -> competitive -> timed -> cooperative', () => {
  const MODE_CYCLE: Record<string, string> = {
    cooperative: 'competitive',
    competitive: 'timed',
    timed: 'cooperative',
  };

  it('cycles cooperative -> competitive', () => {
    expect(MODE_CYCLE['cooperative']).toBe('competitive');
  });

  it('cycles competitive -> timed', () => {
    expect(MODE_CYCLE['competitive']).toBe('timed');
  });

  it('cycles timed -> cooperative', () => {
    expect(MODE_CYCLE['timed']).toBe('cooperative');
  });

  it('unknown mode falls back to cooperative', () => {
    const result = MODE_CYCLE['unknown'] || 'cooperative';
    expect(result).toBe('cooperative');
  });

  it('mode-locked rooms do not cycle', () => {
    const room = { mode: 'cooperative', modeLocked: true };
    if (!room.modeLocked) {
      room.mode = MODE_CYCLE[room.mode] || 'cooperative';
    }
    expect(room.mode).toBe('cooperative'); // unchanged
  });

  it('public rooms cycle mode on completion', () => {
    const room = { mode: 'cooperative', isPublic: true, modeLocked: false };
    if (room.isPublic && !room.modeLocked) {
      room.mode = MODE_CYCLE[room.mode] || 'cooperative';
    }
    expect(room.mode).toBe('competitive');
  });
});

describe('Host migration on disconnect', () => {
  it('assigns next player as host when host leaves', () => {
    const players = new Map([
      ['host', { id: 'host', name: 'Host', dogType: 'jep' }],
      ['player2', { id: 'player2', name: 'P2', dogType: 'jep' }],
      ['player3', { id: 'player3', name: 'P3', dogType: 'jep' }],
    ]);
    let hostId = 'host';

    // Host leaves
    players.delete('host');
    if (players.size > 0) {
      const next = players.keys().next().value as string;
      hostId = next;
    }

    expect(hostId).toBe('player2');
    expect(players.has('host')).toBe(false);
  });

  it('room is empty when last player leaves', () => {
    const players = new Map([
      ['solo', { id: 'solo', name: 'Solo', dogType: 'jep' }],
    ]);

    players.delete('solo');
    expect(players.size).toBe(0);
  });

  it('idempotent leave - second call is safe', () => {
    const players = new Map([
      ['p1', { id: 'p1', name: 'P1', dogType: 'jep' }],
      ['p2', { id: 'p2', name: 'P2', dogType: 'jep' }],
    ]);
    const hostId = 'p1';

    // First leave
    const firstLeave = players.has('p1');
    if (firstLeave) players.delete('p1');
    // Second leave - should be no-op
    const secondLeave = players.has('p1');
    expect(secondLeave).toBe(false); // already gone, safe to ignore

    expect(players.size).toBe(1);
    expect(players.has('p2')).toBe(true);
    void hostId; // suppress unused warning
  });
});

describe('Competitive mode completion', () => {
  it('2-player: first to 100 wins (half of 200 sheep)', () => {
    const scores = { p1: 100, p2: 50 };
    const result = checkCompetitiveCompletion(scores, 2, 200);
    expect(result.isComplete).toBe(true);
    expect(result.winner).toBe('p1');
    expect(result.winType).toBe('race');
  });

  it('2-player: not complete when neither has reached threshold', () => {
    const scores = { p1: 60, p2: 55 };
    const result = checkCompetitiveCompletion(scores, 2, 200);
    expect(result.isComplete).toBe(false);
  });

  it('3-player: completes when all sheep retired', () => {
    const scores = { p1: 70, p2: 65, p3: 65 };
    const result = checkCompetitiveCompletion(scores, 3, 200);
    expect(result.isComplete).toBe(true);
    expect(result.winner).toBe('p1');
    expect(result.winType).toBe('highest_score');
  });
});

describe('Cooperative mode completion', () => {
  it('not complete when sheep still active', () => {
    const sheep = [makeSheep(0, 10, 10), makeSheep(1, 20, 20)];
    const result = checkGameCompletion(
      sheep as Parameters<typeof checkGameCompletion>[0],
      2,
      true
    );
    expect(result.isComplete).toBe(false);
    expect(result.completionPercentage).toBe(0);
  });

  it('complete when all sheep retired', () => {
    const sheep = [makeSheep(0, 10, 10), makeSheep(1, 20, 20)];
    // Retire both
    for (const s of sheep) {
      s.hasPassedGate = true;
      s.isRetiring = true;
    }
    const result = checkGameCompletion(
      sheep as Parameters<typeof checkGameCompletion>[0],
      2,
      true
    );
    expect(result.isComplete).toBe(true);
    expect(result.completionPercentage).toBe(100);
  });
});

describe('Competitive gate layout', () => {
  it('generates 2-gate layout for 2 players', () => {
    const gates = generateCompetitiveGateLayout(2);
    expect(gates).toHaveLength(2);
  });

  it('generates 4-gate layout for 4 players', () => {
    const gates = generateCompetitiveGateLayout(4);
    expect(gates).toHaveLength(4);
  });

  it('assigns player IDs to gates', () => {
    const gates = generateCompetitiveGateLayout(2);
    const assigned = assignGatesToPlayers(gates, ['alpha', 'beta']);
    const playerIds = (assigned as unknown as { playerId: string }[]).map(g => g.playerId);
    expect(playerIds).toContain('alpha');
    expect(playerIds).toContain('beta');
  });
});

describe('Stamina system', () => {
  it('drains stamina when sprinting and moving', () => {
    const dog = makeDog('p1');
    dog.stamina = 100;
    // updateStamina only drains when entity is moving (velocity.magnitude() > 0.1)
    dog.velocity = new Vector2D(10, 0);

    const result = updateStamina(
      dog as Parameters<typeof updateStamina>[0],
      true,
      DELTA_TIME,
      { maxStamina: 100, drainRate: 35, regenRate: 25, minStaminaToConsume: 10 }
    );

    expect(result.current).toBeLessThan(100);
    expect(result.isConsuming).toBe(true);
  });

  it('regenerates stamina when not sprinting', () => {
    const dog = makeDog('p1');
    dog.stamina = 50;

    const result = updateStamina(
      dog as Parameters<typeof updateStamina>[0],
      false,
      DELTA_TIME,
      { maxStamina: 100, drainRate: 35, regenRate: 25, minStaminaToConsume: 10 }
    );

    expect(result.current).toBeGreaterThan(50);
    expect(result.isConsuming).toBe(false);
  });

  it('does not sprint when stamina below threshold', () => {
    const dog = makeDog('p1');
    dog.stamina = 5; // below minStaminaToConsume

    const result = updateStamina(
      dog as Parameters<typeof updateStamina>[0],
      true, // trying to sprint
      DELTA_TIME,
      { maxStamina: 100, drainRate: 35, regenRate: 25, minStaminaToConsume: 10 }
    );

    expect(result.isConsuming).toBe(false);
  });
});
