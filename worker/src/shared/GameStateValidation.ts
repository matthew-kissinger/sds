import { Vector2D } from './Vector2D';
import { isWithinArea, checkGatePassage, Bounds, Gate } from './BoundaryCollision';

/**
 * Pure game state validation functions
 * Stateless and deterministic - no external dependencies
 */

export interface SheepEntity {
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  hasPassedGate: boolean;
  isRetiring: boolean;
  retirementTarget: Vector2D | null;
  state: number;
  fleeRadius?: number;
  assignedGate?: number;
}

export interface Pasture extends Bounds {
  centerZ?: number;
}

export interface RetirementResult {
  newRetirements: number;
  totalRetired: number;
}

/**
 * Validate and update sheep retirement status
 */
export function updateSheepRetirements(sheep: SheepEntity[], gate: Gate & { passageZone: Bounds }, pasture: Pasture): RetirementResult {
  let newRetirements = 0;
  let totalRetired = 0;

  for (const sheepEntity of sheep) {
    if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
      if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, 'north')) {
        sheepEntity.hasPassedGate = true;
        sheepEntity.isRetiring = true;

        const margin = 3;
        sheepEntity.retirementTarget = new Vector2D(
          pasture.minX + margin + Math.random() * (pasture.maxX - pasture.minX - 2 * margin),
          pasture.minZ + margin + Math.random() * (pasture.maxZ - pasture.minZ - 2 * margin)
        );

        newRetirements++;
      }
    }

    if (sheepEntity.isRetiring && sheepEntity.retirementTarget) {
      const distanceToTarget = sheepEntity.position.distanceTo(sheepEntity.retirementTarget);
      if (distanceToTarget < 2) {
        sheepEntity.retirementTarget = null;
        sheepEntity.state = 2;
        sheepEntity.velocity.set(0, 0);
        sheepEntity.acceleration.set(0, 0);
      }
    }

    if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
      totalRetired++;
    }
  }

  return {
    newRetirements,
    totalRetired
  };
}

export interface CompletionResult {
  isComplete: boolean;
  completionPercentage: number;
}

/**
 * Check if game completion conditions are met
 */
export function checkGameCompletion(sheep: SheepEntity[], totalSheep: number, gameActive: boolean): CompletionResult {
  if (!gameActive) {
    return {
      isComplete: false,
      completionPercentage: 0
    };
  }

  const retiredCount = sheep.filter(s => s.hasPassedGate || s.isRetiring).length;
  const completionPercentage = (retiredCount / totalSheep) * 100;
  const isComplete = retiredCount === totalSheep;

  return {
    isComplete,
    completionPercentage
  };
}

export interface GameState {
  sheep: SheepEntity[];
  sheepdog?: {
    position: Vector2D;
    velocity: Vector2D;
    stamina: number;
    maxStamina: number;
  };
  bounds: Bounds;
  gate: Gate;
  sheepRetired: number;
  totalSheep: number;
  gameMode?: string;
  competitiveGates?: Gate[];
  playerScores?: Record<string, number>;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

/**
 * Validate game state consistency
 */
export function validateGameState(gameState: GameState): ValidationResult {
  const issues: string[] = [];

  if (!Array.isArray(gameState.sheep)) {
    issues.push('sheep_not_array');
  } else {
    for (let i = 0; i < gameState.sheep.length; i++) {
      const sheep = gameState.sheep[i];

      if (!sheep.position || typeof sheep.position.x !== 'number' || typeof sheep.position.z !== 'number') {
        issues.push(`sheep_${i}_invalid_position`);
      }

      if (!sheep.velocity || typeof sheep.velocity.x !== 'number' || typeof sheep.velocity.z !== 'number') {
        issues.push(`sheep_${i}_invalid_velocity`);
      }

      if (typeof sheep.hasPassedGate !== 'boolean') {
        issues.push(`sheep_${i}_invalid_gate_status`);
      }

      if (typeof sheep.isRetiring !== 'boolean') {
        issues.push(`sheep_${i}_invalid_retirement_status`);
      }
    }
  }

  if (gameState.sheepdog) {
    if (!gameState.sheepdog.position ||
        typeof gameState.sheepdog.position.x !== 'number' ||
        typeof gameState.sheepdog.position.z !== 'number') {
      issues.push('sheepdog_invalid_position');
    }

    if (!gameState.sheepdog.velocity ||
        typeof gameState.sheepdog.velocity.x !== 'number' ||
        typeof gameState.sheepdog.velocity.z !== 'number') {
      issues.push('sheepdog_invalid_velocity');
    }

    if (typeof gameState.sheepdog.stamina !== 'number' ||
        gameState.sheepdog.stamina < 0 ||
        gameState.sheepdog.stamina > gameState.sheepdog.maxStamina) {
      issues.push('sheepdog_invalid_stamina');
    }
  }

  if (!gameState.bounds ||
      typeof gameState.bounds.minX !== 'number' ||
      typeof gameState.bounds.maxX !== 'number' ||
      typeof gameState.bounds.minZ !== 'number' ||
      typeof gameState.bounds.maxZ !== 'number') {
    issues.push('invalid_bounds');
  }

  if (!gameState.gate ||
      !gameState.gate.position ||
      typeof gameState.gate.width !== 'number') {
    issues.push('invalid_gate');
  }

  if (typeof gameState.sheepRetired !== 'number' || gameState.sheepRetired < 0) {
    issues.push('invalid_sheep_retired_count');
  }

  if (typeof gameState.totalSheep !== 'number' || gameState.totalSheep <= 0) {
    issues.push('invalid_total_sheep_count');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export interface ProgressMetrics {
  inField: number;
  passingGate: number;
  inPasture: number;
  grazing: number;
  totalRetired: number;
  completionPercentage: number;
}

/**
 * Calculate game progress metrics
 */
export function calculateGameProgress(sheep: SheepEntity[], totalSheep: number, pasture: Pasture): ProgressMetrics {
  let inField = 0;
  let passingGate = 0;
  let inPasture = 0;
  let grazing = 0;

  for (const sheepEntity of sheep) {
    if (sheepEntity.state === 2) {
      grazing++;
    } else if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
      if (isWithinArea(sheepEntity.position, pasture)) {
        inPasture++;
      } else {
        passingGate++;
      }
    } else {
      inField++;
    }
  }

  return {
    inField,
    passingGate,
    inPasture,
    grazing,
    totalRetired: passingGate + inPasture + grazing,
    completionPercentage: ((passingGate + inPasture + grazing) / totalSheep) * 100
  };
}

export interface SpawnConfig {
  spreadRadius?: number;
  centerX?: number;
  centerZ?: number;
  avoidAreas?: Bounds[];
  competitiveMode?: boolean;
  competitiveGates?: Gate[];
  clusterCount?: number;
  clusterCenters?: Array<{ x: number; z: number }>;
}

/**
 * Generate initial sheep positions in a clustered formation
 */
export function generateInitialSheepPositions(sheepCount: number, bounds: Bounds, config: SpawnConfig = {}): Vector2D[] {
  const {
    spreadRadius = 30,
    centerX = -30,
    centerZ = -30,
    avoidAreas = [],
    competitiveMode = false,
    competitiveGates = [],
    clusterCenters = null
  } = config;

  const positions: Vector2D[] = [];

  if (competitiveMode && competitiveGates.length > 0) {
    return generateCompetitiveBalancedSpawns(sheepCount, bounds, competitiveGates, config);
  }

  const centers = clusterCenters || [{ x: centerX, z: centerZ }];
  const sheepPerCluster = Math.ceil(sheepCount / centers.length);

  for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex++) {
    const center = centers[clusterIndex];
    const startIndex = clusterIndex * sheepPerCluster;
    const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);

    for (let i = startIndex; i < endIndex; i++) {
      let position: Vector2D;
      let attempts = 0;
      const maxAttempts = 50;

      do {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spreadRadius;
        const x = center.x + Math.cos(angle) * distance;
        const z = center.z + Math.sin(angle) * distance;

        position = new Vector2D(x, z);
        attempts++;

        const withinBounds = position.x >= bounds.minX + 5 &&
          position.x <= bounds.maxX - 5 &&
          position.z >= bounds.minZ + 5 &&
          position.z <= bounds.maxZ - 5;

        let inAvoidArea = false;
        for (const area of avoidAreas) {
          if (isWithinArea(position, area)) {
            inAvoidArea = true;
            break;
          }
        }

        if (withinBounds && !inAvoidArea) {
          break;
        }
      } while (attempts < maxAttempts);

      positions.push(position!);
    }
  }

  return positions;
}

export interface CompetitiveSpawnConfig {
  spreadRadius?: number;
  minDistanceFromGates?: number;
  avoidAreas?: Bounds[];
}

/**
 * Generate balanced sheep spawns for competitive mode
 */
export function generateCompetitiveBalancedSpawns(sheepCount: number, bounds: Bounds, competitiveGates: Gate[], config: CompetitiveSpawnConfig = {}): Vector2D[] {
  const {
    spreadRadius = 25,
    minDistanceFromGates = 35,
    avoidAreas = []
  } = config;

  const spawnClusters = calculateBalancedSpawnClusters(competitiveGates, bounds, minDistanceFromGates);
  const positions: Vector2D[] = [];
  const sheepPerCluster = Math.ceil(sheepCount / spawnClusters.length);

  console.log(`Generating competitive spawns: ${spawnClusters.length} clusters, ~${sheepPerCluster} sheep per cluster`);

  for (let clusterIndex = 0; clusterIndex < spawnClusters.length; clusterIndex++) {
    const cluster = spawnClusters[clusterIndex];
    const startIndex = clusterIndex * sheepPerCluster;
    const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);

    for (let i = startIndex; i < endIndex; i++) {
      let position: Vector2D;
      let attempts = 0;
      const maxAttempts = 50;

      do {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spreadRadius;
        const x = cluster.x + Math.cos(angle) * distance;
        const z = cluster.z + Math.sin(angle) * distance;

        position = new Vector2D(x, z);
        attempts++;

        const withinBounds = position.x >= bounds.minX + 5 &&
          position.x <= bounds.maxX - 5 &&
          position.z >= bounds.minZ + 5 &&
          position.z <= bounds.maxZ - 5;

        let tooCloseToGates = false;
        for (const gate of competitiveGates) {
          const distanceToGate = position.distanceTo(gate.position);
          if (distanceToGate < minDistanceFromGates) {
            tooCloseToGates = true;
            break;
          }
        }

        let inAvoidArea = false;
        for (const area of avoidAreas) {
          if (isWithinArea(position, area)) {
            inAvoidArea = true;
            break;
          }
        }

        if (withinBounds && !tooCloseToGates && !inAvoidArea) {
          break;
        }
      } while (attempts < maxAttempts);

      positions.push(position!);
    }
  }

  return positions;
}

interface SpawnCluster {
  x: number;
  z: number;
  description: string;
}

/**
 * Calculate balanced spawn cluster positions for competitive mode
 */
export function calculateBalancedSpawnClusters(competitiveGates: Gate[], bounds: Bounds, minDistanceFromGates = 35): SpawnCluster[] {
  const clusters: SpawnCluster[] = [];

  if (competitiveGates.length === 2) {
    clusters.push(
      { x: -50, z: 0, description: 'West neutral zone' },
      { x: 50, z: 0, description: 'East neutral zone' },
      { x: 0, z: -50, description: 'South-center neutral zone' }
    );
  } else if (competitiveGates.length === 3) {
    clusters.push(
      { x: 0, z: 0, description: 'Central cluster' },
      { x: -40, z: -20, description: 'Southwest cluster' },
      { x: 40, z: -20, description: 'Southeast cluster' },
      { x: 0, z: -50, description: 'South cluster' }
    );
  } else if (competitiveGates.length === 4) {
    clusters.push(
      { x: 0, z: 0, description: 'Center cluster' },
      { x: -30, z: -30, description: 'Southwest cluster' },
      { x: 30, z: -30, description: 'Southeast cluster' },
      { x: 0, z: -60, description: 'South cluster' }
    );
  } else {
    clusters.push({ x: 0, z: -30, description: 'Default central cluster' });
  }

  const validatedClusters: SpawnCluster[] = [];
  for (const cluster of clusters) {
    let adjustedCluster = { ...cluster };
    let isValid = false;
    let adjustmentAttempts = 0;

    while (!isValid && adjustmentAttempts < 10) {
      let minDistanceFromAnyGate = Infinity;
      for (const gate of competitiveGates) {
        const distance = Math.sqrt(
          (adjustedCluster.x - gate.position.x) ** 2 +
          (adjustedCluster.z - gate.position.z) ** 2
        );
        minDistanceFromAnyGate = Math.min(minDistanceFromAnyGate, distance);
      }

      const withinBounds = adjustedCluster.x >= bounds.minX + 20 &&
        adjustedCluster.x <= bounds.maxX - 20 &&
        adjustedCluster.z >= bounds.minZ + 20 &&
        adjustedCluster.z <= bounds.maxZ - 20;

      if (minDistanceFromAnyGate >= minDistanceFromGates && withinBounds) {
        isValid = true;
      } else {
        adjustedCluster.x *= 0.9;
        adjustedCluster.z *= 0.9;
        adjustmentAttempts++;
      }
    }

    if (isValid) {
      validatedClusters.push(adjustedCluster);
      console.log(`Spawn cluster: ${cluster.description} at (${Math.round(adjustedCluster.x)}, ${Math.round(adjustedCluster.z)})`);
    } else {
      console.warn(`Could not validate spawn cluster: ${cluster.description}`);
    }
  }

  if (validatedClusters.length === 0) {
    console.warn('No valid spawn clusters found, using fallback center position');
    validatedClusters.push({ x: 0, z: -30, description: 'Fallback center' });
  }

  return validatedClusters;
}

/**
 * Reset game state to initial conditions
 */
export function resetGameState(gameState: GameState, initialPositions: Vector2D[]): GameState {
  for (let i = 0; i < gameState.sheep.length; i++) {
    const sheep = gameState.sheep[i];
    const initialPos = initialPositions[i] || new Vector2D(-30, -30);

    sheep.position = initialPos.clone();
    sheep.velocity = new Vector2D(0, 0);
    sheep.acceleration = new Vector2D(0, 0);
    sheep.hasPassedGate = false;
    sheep.isRetiring = false;
    sheep.retirementTarget = null;
    sheep.state = 0;
  }

  (gameState as unknown as Record<string, unknown>)['sheepRetired'] = 0;
  (gameState as unknown as Record<string, unknown>)['gameCompleted'] = false;
  (gameState as unknown as Record<string, unknown>)['gameActive'] = false;

  return gameState;
}

export interface HerdingMetrics {
  sheepInRange: number;
  sheepFleeing: number;
  averageDistanceToGate: number;
  herdingPressure: number;
}

/**
 * Calculate herding effectiveness metrics
 */
export function calculateHerdingEffectiveness(sheepdog: { position: Vector2D } | null, sheep: SheepEntity[], gate: Gate): HerdingMetrics {
  if (!sheepdog) {
    return {
      sheepInRange: 0,
      sheepFleeing: 0,
      averageDistanceToGate: 0,
      herdingPressure: 0
    };
  }

  let sheepInRange = 0;
  let sheepFleeing = 0;
  let totalDistanceToGate = 0;

  for (const sheepEntity of sheep) {
    const distanceToSheepdog = sheepEntity.position.distanceTo(sheepdog.position);
    const distanceToGate = sheepEntity.position.distanceTo(gate.position);

    if (distanceToSheepdog < 15) {
      sheepInRange++;
    }

    if (sheepEntity.fleeRadius !== undefined && distanceToSheepdog < sheepEntity.fleeRadius) {
      sheepFleeing++;
    }

    totalDistanceToGate += distanceToGate;
  }

  const averageDistanceToGate = totalDistanceToGate / sheep.length;
  const herdingPressure = (sheepFleeing / sheep.length) * 100;

  return {
    sheepInRange,
    sheepFleeing,
    averageDistanceToGate,
    herdingPressure
  };
}

interface CompetitiveLayout {
  gate: { x: number; z: number };
  pasture: { minX: number; maxX: number; minZ: number; maxZ: number };
  playerId: string | null;
  color: number;
  direction: string;
}

/**
 * Generate competitive gate layout for multiple players
 */
export function generateCompetitiveGateLayout(playerCount: number): Gate[] {
  const competitiveLayouts: Record<number, CompetitiveLayout[]> = {
    2: [
      { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, playerId: null, color: 0xFF0000, direction: 'north' },
      { gate: { x: 0, z: -100 }, pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 }, playerId: null, color: 0x0000FF, direction: 'south' }
    ],
    3: [
      { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, playerId: null, color: 0xFF0000, direction: 'north' },
      { gate: { x: 100, z: 0 }, pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 }, playerId: null, color: 0x0000FF, direction: 'east' },
      { gate: { x: -100, z: 0 }, pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 }, playerId: null, color: 0x00FF00, direction: 'west' }
    ],
    4: [
      { gate: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }, playerId: null, color: 0xFF0000, direction: 'north' },
      { gate: { x: 0, z: -100 }, pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 }, playerId: null, color: 0x0000FF, direction: 'south' },
      { gate: { x: 100, z: 0 }, pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 }, playerId: null, color: 0x00FF00, direction: 'east' },
      { gate: { x: -100, z: 0 }, pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 }, playerId: null, color: 0xFFFF00, direction: 'west' }
    ]
  };

  if (!competitiveLayouts[playerCount]) {
    throw new Error(`Unsupported player count: ${playerCount}. Must be 2-4 players.`);
  }

  return competitiveLayouts[playerCount].map((layout, index) => {
    let passageZone: Bounds;
    const gateWidth = 8;
    const gateDepth = 4;

    switch (layout.direction) {
      case 'north':
      case 'south':
        passageZone = {
          minX: layout.gate.x - gateWidth / 2,
          maxX: layout.gate.x + gateWidth / 2,
          minZ: layout.gate.z - gateDepth,
          maxZ: layout.gate.z + gateDepth
        };
        break;
      case 'east':
      case 'west':
        passageZone = {
          minX: layout.gate.x - gateDepth,
          maxX: layout.gate.x + gateDepth,
          minZ: layout.gate.z - gateWidth / 2,
          maxZ: layout.gate.z + gateWidth / 2
        };
        break;
      default:
        passageZone = {
          minX: layout.gate.x - gateWidth / 2,
          maxX: layout.gate.x + gateWidth / 2,
          minZ: layout.gate.z - gateDepth,
          maxZ: layout.gate.z + gateDepth
        };
    }

    return {
      id: index,
      position: new Vector2D(layout.gate.x, layout.gate.z),
      width: gateWidth,
      height: 4,
      passageZone,
      pasture: {
        centerZ: (layout.pasture.minZ + layout.pasture.maxZ) / 2,
        minX: layout.pasture.minX,
        maxX: layout.pasture.maxX,
        minZ: layout.pasture.minZ,
        maxZ: layout.pasture.maxZ
      },
      playerId: layout.playerId,
      color: layout.color,
      direction: layout.direction
    } as unknown as Gate;
  });
}

/**
 * Assign gates to players in competitive mode
 */
export function assignGatesToPlayers(gates: Gate[], playerIds: string[]): Gate[] {
  if (gates.length !== playerIds.length) {
    throw new Error(`Gate count (${gates.length}) must match player count (${playerIds.length})`);
  }

  return gates.map((gate, index) => ({
    ...gate,
    playerId: playerIds[index % playerIds.length]
  }));
}

export interface CompetitiveRetirementResult {
  playerRetirements: Record<string, number>;
  totalRetired: number;
}

/**
 * Update sheep retirements for competitive mode with multiple gates
 */
export function updateCompetitiveSheepRetirements(sheep: SheepEntity[], competitiveGates: (Gate & { passageZone: Bounds; playerId?: string | null; id: number; pasture: Pasture })[]): CompetitiveRetirementResult {
  let totalRetired = 0;
  const playerRetirements = new Map<string, number>();

  for (const gate of competitiveGates) {
    if (gate.playerId && !playerRetirements.has(gate.playerId)) {
      playerRetirements.set(gate.playerId, 0);
    }
  }

  for (const sheepEntity of sheep) {
    if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
      for (const gate of competitiveGates) {
        if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, gate.direction)) {
          sheepEntity.hasPassedGate = true;
          sheepEntity.isRetiring = true;
          sheepEntity.assignedGate = gate.id;

          const margin = 3;
          sheepEntity.retirementTarget = new Vector2D(
            gate.pasture.minX + margin + Math.random() * (gate.pasture.maxX - gate.pasture.minX - 2 * margin),
            gate.pasture.minZ + margin + Math.random() * (gate.pasture.maxZ - gate.pasture.minZ - 2 * margin)
          );

          if (gate.playerId && playerRetirements.has(gate.playerId)) {
            playerRetirements.set(gate.playerId, (playerRetirements.get(gate.playerId) ?? 0) + 1);
          }

          break;
        }
      }
    }

    if (sheepEntity.isRetiring && sheepEntity.retirementTarget) {
      const distanceToTarget = sheepEntity.position.distanceTo(sheepEntity.retirementTarget);
      if (distanceToTarget < 2) {
        sheepEntity.retirementTarget = null;
        sheepEntity.state = 2;
        sheepEntity.velocity.set(0, 0);
        sheepEntity.acceleration.set(0, 0);
      }
    }

    if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
      totalRetired++;
    }
  }

  return {
    playerRetirements: Object.fromEntries(playerRetirements),
    totalRetired
  };
}

export interface CompetitiveCompletionResult {
  isComplete: boolean;
  winner: string | null;
  winType: string | null;
  finalScores?: Record<string, number>;
}

/**
 * Check competitive game completion conditions
 */
export function checkCompetitiveCompletion(playerScores: Record<string, number>, playerCount: number, totalSheep: number): CompetitiveCompletionResult {
  const scores = Object.values(playerScores);
  const maxScore = Math.max(...scores);
  const totalRetired = scores.reduce((sum, score) => sum + score, 0);

  if (playerCount === 2) {
    const winThreshold = Math.ceil(totalSheep / 2);
    if (maxScore >= winThreshold) {
      const winner = Object.keys(playerScores).find(playerId => playerScores[playerId] === maxScore) ?? null;
      return {
        isComplete: true,
        winner,
        winType: 'race',
        finalScores: playerScores
      };
    }
  }

  if (playerCount >= 3) {
    if (totalRetired >= totalSheep) {
      const winner = Object.keys(playerScores).find(playerId => playerScores[playerId] === maxScore) ?? null;
      return {
        isComplete: true,
        winner,
        winType: 'highest_score',
        finalScores: playerScores
      };
    }
  }

  return {
    isComplete: false,
    winner: null,
    winType: null
  };
}

export interface CompetitiveValidationResult {
  isValid: boolean;
  issues: string[];
}

/**
 * Validate competitive game state structure
 */
export function validateCompetitiveGameState(gameState: GameState): CompetitiveValidationResult {
  const issues: string[] = [];

  if (gameState.gameMode !== 'racing') {
    issues.push('not_racing_mode');
    return { isValid: false, issues };
  }

  if (!Array.isArray(gameState.competitiveGates)) {
    issues.push('competitive_gates_not_array');
  } else {
    for (let i = 0; i < gameState.competitiveGates.length; i++) {
      const gate = gameState.competitiveGates[i];

      if (!gate.position || typeof gate.position.x !== 'number' || typeof gate.position.z !== 'number') {
        issues.push(`competitive_gate_${i}_invalid_position`);
      }

      const gateWithPasture = gate as unknown as { pasture?: { minX: number; maxX: number; minZ: number; maxZ: number } };
      if (!gateWithPasture.pasture ||
          typeof gateWithPasture.pasture.minX !== 'number' ||
          typeof gateWithPasture.pasture.maxX !== 'number' ||
          typeof gateWithPasture.pasture.minZ !== 'number' ||
          typeof gateWithPasture.pasture.maxZ !== 'number') {
        issues.push(`competitive_gate_${i}_invalid_pasture`);
      }

      const gateWithPassageZone = gate as unknown as { passageZone?: Bounds };
      if (!gateWithPassageZone.passageZone ||
          typeof gateWithPassageZone.passageZone.minX !== 'number' ||
          typeof gateWithPassageZone.passageZone.maxX !== 'number' ||
          typeof gateWithPassageZone.passageZone.minZ !== 'number' ||
          typeof gateWithPassageZone.passageZone.maxZ !== 'number') {
        issues.push(`competitive_gate_${i}_invalid_passage_zone`);
      }
    }
  }

  if (!gameState.playerScores || typeof gameState.playerScores !== 'object') {
    issues.push('player_scores_not_object');
  }

  const expectedGateCount = gameState.competitiveGates ? gameState.competitiveGates.length : 0;
  const playerCount = gameState.playerScores ? Object.keys(gameState.playerScores).length : 0;

  if (expectedGateCount !== playerCount) {
    issues.push('gate_count_player_count_mismatch');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export interface CompetitiveGameStateConfig {
  totalSheep?: number;
  bounds?: Bounds;
}

/**
 * Create a competitive game state structure
 */
export function createCompetitiveGameState(config: CompetitiveGameStateConfig = {}, playerIds: string[] = []): Record<string, unknown> {
  const {
    totalSheep = 200,
    bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
  } = config;

  const playerCount = playerIds.length;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('Competitive mode requires 2-4 players');
  }

  const competitiveGates = generateCompetitiveGateLayout(playerCount);
  const assignedGates = assignGatesToPlayers(competitiveGates, playerIds);

  const playerScores: Record<string, number> = {};
  for (const playerId of playerIds) {
    playerScores[playerId] = 0;
  }

  return {
    gameMode: 'racing',
    bounds,
    competitiveGates: assignedGates,
    playerScores,
    params: {
      speed: 0.1,
      cohesion: 1.0,
      separationDistance: 2.0
    },
    sheep: [],
    totalSheep,
    gameCompleted: false,
    gameActive: false
  };
}
