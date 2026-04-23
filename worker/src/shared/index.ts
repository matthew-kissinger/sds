export { Vector2D } from './Vector2D';
export {
  calculateFlockingForce,
  calculateSeparation,
  calculateAlignment,
  calculateCohesion,
  calculateSeek,
  calculateFlee,
  getNeighbors,
} from './FlockingAlgorithms';
export type { Boid, FlockingConfig } from './FlockingAlgorithms';
export {
  updateMovement,
  applyAcceleration,
  updateStamina,
  interpolatePosition,
  interpolateRotation,
  validateEntityState,
} from './MovementPhysics';
export type {
  MovingEntity,
  MovementConfig,
  MovementResult,
  AccelerationConfig,
  StaminaConfig,
  StaminaResult,
  ValidationResult as MovementValidationResult,
} from './MovementPhysics';
export {
  calculateBoundaryAvoidance,
  calculateBoundaryAvoidanceWithGate,
  calculateBoundaryAvoidanceWithMultipleGates,
  applyHardBoundaryConstraints,
  applyHardBoundaryConstraintsWithMultipleGates,
  isWithinArea,
  checkGatePassage,
  getDistanceToNearestBoundary,
  generateRandomPositionInBounds,
} from './BoundaryCollision';
export type {
  Bounds,
  Gate,
  BoundaryConfig,
  EntityWithPosition,
  HardBoundaryConfig,
  BoundaryDistanceResult,
  RandomPositionConfig,
} from './BoundaryCollision';
export {
  updateSheepRetirements,
  checkGameCompletion,
  validateGameState,
  calculateGameProgress,
  generateInitialSheepPositions,
  generateCompetitiveBalancedSpawns,
  calculateBalancedSpawnClusters,
  resetGameState,
  calculateHerdingEffectiveness,
  generateCompetitiveGateLayout,
  assignGatesToPlayers,
  updateCompetitiveSheepRetirements,
  checkCompetitiveCompletion,
  validateCompetitiveGameState,
  createCompetitiveGameState,
} from './GameStateValidation';
export type {
  SheepEntity,
  Pasture,
  RetirementResult,
  CompletionResult,
  GameState,
  ValidationResult,
  ProgressMetrics,
  SpawnConfig,
  CompetitiveSpawnConfig,
  HerdingMetrics,
  CompetitiveRetirementResult,
  CompetitiveCompletionResult,
  CompetitiveValidationResult,
  CompetitiveGameStateConfig,
} from './GameStateValidation';
