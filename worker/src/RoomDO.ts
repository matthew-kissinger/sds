import { DurableObject } from 'cloudflare:workers';
import { encode, decode } from '@msgpack/msgpack';
import {
  Vector2D,
  calculateFlockingForce,
  calculateFlee,
  getNeighbors,
  applyAcceleration,
  updateStamina,
  calculateBoundaryAvoidanceWithGate,
  calculateBoundaryAvoidanceWithMultipleGates,
  applyHardBoundaryConstraints,
  applyHardBoundaryConstraintsWithMultipleGates,
  updateSheepRetirements,
  checkGameCompletion,
  validateEntityState,
  generateInitialSheepPositions,
  generateCompetitiveGateLayout,
  assignGatesToPlayers,
  updateCompetitiveSheepRetirements,
  checkCompetitiveCompletion,
  checkGatePassage,
} from './shared';
import type { Bounds, Gate } from './shared';
import type {
  SheepDelta,
  DogState,
  StateMsg,
  LobbyMsg,
  GameStartMsg,
  CompleteMsg,
  HostChangedMsg,
  ErrorMsg,
  ServerMessage,
  CompetitiveGateInfo,
} from './protocol';

// ---- Internal types ----

interface PlayerInfo {
  id: string;
  name: string;
  dogType: string;
}

interface RoomState {
  roomCode: string;
  mode: string;
  state: 'waiting' | 'in-game' | 'finished';
  hostId: string | null;
  players: Map<string, PlayerInfo>;
  modeLocked: boolean;
  isPublic: boolean;
}

interface SheepInternalState {
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
  animationPhase: number;
  // Timed mode
  scheduledForRemoval?: boolean;
  disappearTime?: number;
}

interface SheepdogInternalState {
  id: string;
  dogType: string;
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
  lastInputTime: number;
  pendingInputs: InputQueueItem[];
  clientStopTarget: Vector2D | null;
  isInterpolatingToClient: boolean;
}

interface InputQueueItem {
  direction: { x: number; z: number };
  sprint: boolean;
  inputSequence: number;
  timestamp: number;
  clientPosition?: { x: number; z: number };
}

// Previous broadcast snapshot per sheep (for delta encoding)
interface SheepSnapshot {
  x: number;
  z: number;
  state: number;
  hasPassedGate: boolean;
  isRetiring: boolean;
}

// ---- Constants ----
const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;
const DELTA_TIME = 1 / TICK_RATE;
const BOUNDS: Bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const SHEEP_DELTA_THRESHOLD = 0.1; // units - only send if moved more than this
const MODE_CYCLE: Record<string, string> = {
  cooperative: 'competitive',
  competitive: 'timed',
  timed: 'cooperative',
};

// Cooperative mode gate + pasture definitions
const COOP_GATE: Gate & { passageZone: Bounds; pasture: Bounds } = {
  position: new Vector2D(0, 100),
  width: 8,
  direction: 'north',
  passageZone: { minX: -4, maxX: 4, minZ: 96, maxZ: 104 },
  pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
};

export class RoomDO extends DurableObject {
  private room: RoomState = {
    roomCode: '',
    mode: 'cooperative',
    state: 'waiting',
    hostId: null,
    players: new Map(),
    modeLocked: false,
    isPublic: false,
  };

  // Simulation state (null when not running)
  private sheep: SheepInternalState[] = [];
  private sheepdogs: Map<string, SheepdogInternalState> = new Map();
  private dogConfigs: Map<string, { acceleration: number; deceleration: number; maxSpeed: number }> = new Map();
  private sheepConfig = {
    maxSpeed: 0.24,
    maxForce: 0.05,
    perceptionRadius: 6,
    separationDistance: 2.5,
  };

  private tickCount = 0;
  private gameStartTime = 0;
  private gameDuration = 3 * 60 * 1000; // 3 minutes
  private isCompetitive = false;
  private isTimedMode = false;
  private competitiveGates: (Gate & { passageZone: Bounds; pasture: Bounds; id: number; playerId: string | null; color: number; direction: string })[] = [];
  private playerScores: Record<string, number> = {};
  private sheepRetired = 0;
  private gameCompleted = false;
  private nextSheepId = 200;
  private sheepRemovalQueue: { sheepId: number; removeTime: number }[] = [];

  // Delta encoding: previous broadcast state per sheep
  private prevSnapshots: Map<number, SheepSnapshot> = new Map();

  // Cached environment bindings
  private _env: Env | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this._env = env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      const playerId = url.searchParams.get('playerId') || crypto.randomUUID();
      const playerName = url.searchParams.get('name') || 'Player';
      const dogType = url.searchParams.get('dogType') || 'jep';
      const isPublic = url.searchParams.get('public') === '1';
      this.room.isPublic = isPublic;
      server.serializeAttachment({ playerId, playerName, dogType });
      this.onPlayerJoin(server, { id: playerId, name: playerName, dogType });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/') {
      return Response.json(this.getSerializableState());
    }
    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment() as { playerId: string };
    try {
      let msg: Record<string, unknown>;
      if (message instanceof ArrayBuffer) {
        msg = decode(new Uint8Array(message)) as Record<string, unknown>;
      } else {
        msg = JSON.parse(message);
      }
      this.handleMessage(ws, attachment.playerId, msg);
    } catch (e) {
      console.error('RoomDO: failed to parse message', e);
    }
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string): void {
    const attachment = ws.deserializeAttachment() as { playerId: string };
    this.onPlayerLeave(ws, attachment.playerId);
  }

  async alarm(): Promise<void> {
    if (this.room.state !== 'in-game' || this.gameCompleted) return;
    this.tick();
    // Schedule next alarm if still running
    if (this.room.state === 'in-game' && !this.gameCompleted) {
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  // ---- Player lifecycle ----

  private onPlayerJoin(ws: WebSocket, player: PlayerInfo): void {
    if (this.room.players.has(player.id)) {
      // Already joined (reconnect) - just send current state
      this.sendLobby();
      return;
    }
    if (!this.room.hostId) {
      this.room.hostId = player.id;
      this.room.roomCode = this.room.roomCode || this.generateRoomCode();
    }
    this.room.players.set(player.id, player);
    this.sendLobby();
    this.upsertLobby();
  }

  private onPlayerLeave(ws: WebSocket, playerId: string): void {
    // Idempotent - safe to call twice
    if (!this.room.players.has(playerId)) return;

    this.room.players.delete(playerId);
    this.sheepdogs.delete(playerId);
    this.dogConfigs.delete(playerId);

    if (this.room.players.size === 0) {
      this.room.state = 'finished';
      this.removeLobby();
      this.ctx.storage.deleteAll();
      return;
    }

    // Host migration
    if (this.room.hostId === playerId) {
      const next = this.room.players.keys().next().value as string | undefined;
      this.room.hostId = next ?? null;
      if (next) {
        this.broadcastMsg({ v: 1, t: 'hostChanged', newHost: next } as HostChangedMsg);
      }
    }

    this.sendLobby();
    this.upsertLobby();
  }

  private handleMessage(ws: WebSocket, playerId: string, msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'start':
        this.handleStart(ws, playerId);
        break;
      case 'input':
        this.onPlayerInput(ws, playerId, msg);
        break;
      case 'leave':
        this.onPlayerLeave(ws, playerId);
        break;
      case 'modeLock':
        if (playerId === this.room.hostId) {
          this.room.modeLocked = !!msg.locked;
          this.sendLobby();
        }
        break;
      case 'setDog': {
        const player = this.room.players.get(playerId);
        if (player && typeof msg.dogType === 'string') {
          player.dogType = msg.dogType;
          this.sendLobby();
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Game start ----

  private async handleStart(ws: WebSocket, playerId: string): Promise<void> {
    if (playerId !== this.room.hostId) {
      this.sendError(ws, 'only the host can start');
      return;
    }
    if (this.room.state !== 'waiting') {
      this.sendError(ws, 'game cannot be started in current state');
      return;
    }
    if (this.room.players.size < 2) {
      this.sendError(ws, 'need at least 2 players to start');
      return;
    }
    this.startGame();
  }

  private startGame(): void {
    this.room.state = 'in-game';
    this.gameCompleted = false;
    this.tickCount = 0;
    this.sheepRetired = 0;
    this.prevSnapshots.clear();
    this.sheepRemovalQueue = [];
    this.nextSheepId = 200;

    const playerIds = Array.from(this.room.players.keys());
    this.isCompetitive = this.room.mode === 'competitive';
    this.isTimedMode = this.room.mode === 'timed';

    this.initSimulation(playerIds);

    // Broadcast start with gate layout for competitive/timed
    const startMsg: GameStartMsg = {
      v: 1,
      t: 'start',
      mode: this.room.mode,
      playerIds,
    };
    if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
      startMsg.competitiveGates = this.competitiveGates.map(g => ({
        id: g.id,
        x: g.position.x,
        z: g.position.z,
        playerId: g.playerId,
        color: g.color,
        direction: g.direction,
        pasture: { minX: g.pasture.minX, maxX: g.pasture.maxX, minZ: g.pasture.minZ, maxZ: g.pasture.maxZ },
      } as CompetitiveGateInfo));
    }
    this.broadcastMsg(startMsg);
    this.upsertLobby();

    // Kick off the alarm-based tick loop
    this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  // ---- Simulation init ----

  private initSimulation(playerIds: string[]): void {
    // Init competitive gates if needed
    if (this.isCompetitive || this.isTimedMode) {
      const gates = generateCompetitiveGateLayout(playerIds.length) as unknown as (Gate & {
        passageZone: Bounds; pasture: Bounds; id: number; playerId: string | null; color: number; direction: string
      })[];
      const assigned = assignGatesToPlayers(gates as unknown as Gate[], playerIds) as unknown as typeof gates;
      this.competitiveGates = assigned;
    } else {
      this.competitiveGates = [];
    }

    // Init player scores
    this.playerScores = {};
    for (const pid of playerIds) {
      this.playerScores[pid] = 0;
    }

    // Init sheep
    const spawnConfig: Record<string, unknown> = {
      spreadRadius: 25,
      centerX: -20,
      centerZ: -20,
    };
    if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
      spawnConfig.competitiveMode = true;
      spawnConfig.competitiveGates = this.competitiveGates;
      spawnConfig.minDistanceFromGates = 35;
    }

    const positions = generateInitialSheepPositions(200, BOUNDS, spawnConfig as Parameters<typeof generateInitialSheepPositions>[2]);
    this.sheep = [];
    for (let i = 0; i < 200; i++) {
      const pos = positions[i];
      this.sheep.push({
        id: i,
        position: pos.clone(),
        velocity: new Vector2D(0, 0),
        acceleration: new Vector2D(0, 0),
        hasPassedGate: false,
        isRetiring: false,
        retirementTarget: null,
        state: 0,
        fleeRadius: 8,
        gateAttraction: 0.5,
        assignedGate: null,
        facingDirection: Math.random() * Math.PI * 2,
        animationPhase: Math.random() * Math.PI * 2,
      });
    }

    // Init sheepdogs
    this.sheepdogs.clear();
    this.dogConfigs.clear();
    playerIds.forEach((pid, index) => {
      const angle = (index / playerIds.length) * Math.PI * 2;
      const radius = 15;
      const playerInfo = this.room.players.get(pid);
      const dogType = playerInfo?.dogType || 'jep';

      const dog: SheepdogInternalState = {
        id: pid,
        dogType,
        position: new Vector2D(Math.cos(angle) * radius, Math.sin(angle) * radius),
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
        lastInputTime: 0,
        pendingInputs: [],
        clientStopTarget: null,
        isInterpolatingToClient: false,
      };
      this.sheepdogs.set(pid, dog);
      this.dogConfigs.set(pid, { acceleration: 80, deceleration: 100, maxSpeed: 30 });
    });

    if (this.isTimedMode) {
      this.gameStartTime = Date.now();
    }
  }

  // ---- Tick ----

  private tick(): void {
    this.tickCount++;
    const currentTime = Date.now();

    this.processPlayerInputs();
    this.updateSheepdogs();
    this.updateSheep();

    if (this.isTimedMode) {
      this.updateTimedMode(currentTime);
    }

    this.checkCompletion();
    this.broadcastState();
  }

  private processPlayerInputs(): void {
    for (const [, dog] of this.sheepdogs.entries()) {
      while (dog.pendingInputs.length > 0) {
        const input = dog.pendingInputs.shift()!;
        this.applyInput(dog, input);
      }
    }
  }

  // ---- Input handling ----

  private onPlayerInput(_ws: WebSocket, playerId: string, msg: Record<string, unknown>): void {
    const dog = this.sheepdogs.get(playerId);
    if (!dog) return;

    const seq = typeof msg.seq === 'number' ? msg.seq : 0;
    const dir = (msg.dir as { x: number; z: number }) || { x: 0, z: 0 };
    const sprint = !!msg.sprint;
    const clientPos = msg.clientPos as { x: number; z: number } | undefined;

    // 5-unit guard on clientPos
    if (clientPos) {
      const dx = clientPos.x - dog.position.x;
      const dz = clientPos.z - dog.position.z;
      if (dx * dx + dz * dz > 25) {
        console.warn(`[CHEAT] clientPos ignored for ${playerId}: delta=${Math.sqrt(dx * dx + dz * dz).toFixed(2)}`);
        // Push input without clientPos
        dog.pendingInputs.push({ direction: dir, sprint, inputSequence: seq, timestamp: Date.now() });
        return;
      }
    }

    dog.pendingInputs.push({
      direction: dir,
      sprint,
      inputSequence: seq,
      timestamp: Date.now(),
      clientPosition: clientPos,
    });
  }

  private applyInput(dog: SheepdogInternalState, input: InputQueueItem): void {
    // Ignore old/duplicate inputs
    if (input.inputSequence <= dog.inputSequence) return;
    dog.inputSequence = input.inputSequence;
    dog.lastInputTime = input.timestamp;

    const targetVelocity = new Vector2D(input.direction.x, input.direction.z);
    const currentMaxSpeed = input.sprint && dog.stamina > 10 ? dog.sprintSpeed : dog.maxSpeed;

    if (targetVelocity.magnitude() > 0) {
      targetVelocity.normalize().multiply(currentMaxSpeed);
    }

    if (input.clientPosition && targetVelocity.magnitude() === 0) {
      dog.clientStopTarget = new Vector2D(input.clientPosition.x, input.clientPosition.z);
      dog.isInterpolatingToClient = true;
      dog.velocity.multiply(0);
      dog.acceleration.multiply(0);
    } else {
      dog.clientStopTarget = null;
      dog.isInterpolatingToClient = false;
      const config = this.dogConfigs.get(dog.id) || { acceleration: 80, deceleration: 100, maxSpeed: 30 };
      applyAcceleration(dog as Parameters<typeof applyAcceleration>[0], targetVelocity, DELTA_TIME, config);
    }

    const staminaResult = updateStamina(dog as Parameters<typeof updateStamina>[0], input.sprint, DELTA_TIME, {
      maxStamina: dog.maxStamina,
      drainRate: 35,
      regenRate: 25,
      minStaminaToConsume: 10,
    });
    dog.stamina = staminaResult.current;
    dog.isSprinting = staminaResult.isConsuming;
  }

  // ---- Sheepdog update ----

  private updateSheepdogs(): void {
    for (const [, dog] of this.sheepdogs.entries()) {
      this.updateDogMovement(dog);

      if (dog.velocity.magnitude() > 0.1) {
        dog.targetRotation = -dog.velocity.angle() + Math.PI / 2;
      }

      let rotDiff = dog.targetRotation - dog.rotation;
      while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
      while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
      dog.rotation += rotDiff * 8 * DELTA_TIME;

      const constrained = applyHardBoundaryConstraints(
        dog as Parameters<typeof applyHardBoundaryConstraints>[0],
        BOUNDS,
        null,
        { margin: 1 }
      );
      dog.position = constrained;

      validateEntityState(dog as Parameters<typeof validateEntityState>[0], new Vector2D(0, 0));
    }
  }

  private updateDogMovement(dog: SheepdogInternalState): void {
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
    dog.velocity.multiply(0.85); // damping

    const smoothed = prevVel.multiply(0.6).add(dog.velocity.clone().multiply(0.4));

    if (smoothed.magnitude() > 0.1) {
      dog.velocity = smoothed;
      dog.position.add(dog.velocity.clone().multiply(DELTA_TIME));
    } else {
      dog.velocity.multiply(0);
    }

    dog.acceleration.multiply(0);
  }

  // ---- Sheep update ----

  private updateSheep(): void {
    const activeSheep = this.sheep.filter(s => s.state === 0);

    for (const sheep of this.sheep) {
      if (sheep.state !== 0) {
        sheep.velocity.set(0, 0);
        sheep.acceleration.set(0, 0);
        continue;
      }

      const neighbors = getNeighbors(
        sheep as Parameters<typeof getNeighbors>[0],
        activeSheep as Parameters<typeof getNeighbors>[1],
        this.sheepConfig.perceptionRadius
      );

      const flockForce = calculateFlockingForce(
        sheep as Parameters<typeof calculateFlockingForce>[0],
        neighbors,
        this.sheepConfig
      );
      sheep.acceleration.add(flockForce);

      for (const dog of this.sheepdogs.values()) {
        const fleeForce = calculateFlee(
          sheep as Parameters<typeof calculateFlee>[0],
          dog.position,
          sheep.fleeRadius,
          this.sheepConfig.maxSpeed,
          this.sheepConfig.maxForce
        );
        if (fleeForce.magnitude() > 0) {
          fleeForce.multiply(1.2);
          sheep.acceleration.add(fleeForce);
        }
      }

      if (this.shouldSeekGate(sheep)) {
        const gateForce = this.calcGateAttraction(sheep);
        sheep.acceleration.add(gateForce);
      }

      // Boundary avoidance - skip if in gate passage zone
      if (!this.inGatePassageZone(sheep)) {
        let boundaryForce: Vector2D;
        if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
          boundaryForce = calculateBoundaryAvoidanceWithMultipleGates(
            sheep as Parameters<typeof calculateBoundaryAvoidanceWithMultipleGates>[0],
            BOUNDS,
            this.competitiveGates as unknown as Gate[],
            { margin: 4, maxSpeed: this.sheepConfig.maxSpeed, maxForce: this.sheepConfig.maxForce }
          );
        } else {
          boundaryForce = calculateBoundaryAvoidanceWithGate(
            sheep as Parameters<typeof calculateBoundaryAvoidanceWithGate>[0],
            BOUNDS,
            COOP_GATE,
            { margin: 4, maxSpeed: this.sheepConfig.maxSpeed, maxForce: this.sheepConfig.maxForce }
          );
        }
        sheep.acceleration.add(boundaryForce);
      }

      this.updateSheepMovement(sheep);

      if (!sheep.hasPassedGate && !sheep.isRetiring) {
        let constrained: Vector2D;
        if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
          constrained = applyHardBoundaryConstraintsWithMultipleGates(
            sheep as Parameters<typeof applyHardBoundaryConstraintsWithMultipleGates>[0],
            BOUNDS,
            this.competitiveGates as unknown as Gate[],
            { margin: 0.5, allowGatePassage: true }
          );
        } else {
          constrained = applyHardBoundaryConstraints(
            sheep as Parameters<typeof applyHardBoundaryConstraints>[0],
            BOUNDS,
            COOP_GATE,
            { margin: 0.5, allowGatePassage: true }
          );
        }
        sheep.position = constrained;
      } else if (sheep.isRetiring && sheep.retirementTarget) {
        const ext = { minX: BOUNDS.minX - 35, maxX: BOUNDS.maxX + 35, minZ: BOUNDS.minZ - 35, maxZ: BOUNDS.maxZ + 35 };
        sheep.position.x = Math.max(ext.minX, Math.min(ext.maxX, sheep.position.x));
        sheep.position.z = Math.max(ext.minZ, Math.min(ext.maxZ, sheep.position.z));
      }

      if (sheep.velocity.magnitude() > 0.001) {
        sheep.facingDirection = sheep.velocity.angle();
      }

      validateEntityState(sheep as Parameters<typeof validateEntityState>[0], new Vector2D(-20, -20));
    }

    // Retirement logic
    if (this.isCompetitive || this.isTimedMode) {
      if (this.isTimedMode) {
        const result = this.updateTimedRetirements();
        for (const [pid, count] of Object.entries(result.playerRetirements)) {
          if (pid in this.playerScores) this.playerScores[pid] += count;
        }
        this.sheepRetired = result.totalRetired;
      } else {
        const result = updateCompetitiveSheepRetirements(
          this.sheep as Parameters<typeof updateCompetitiveSheepRetirements>[0],
          this.competitiveGates as unknown as Parameters<typeof updateCompetitiveSheepRetirements>[1]
        );
        for (const [pid, count] of Object.entries(result.playerRetirements)) {
          if (pid in this.playerScores) this.playerScores[pid] += count;
        }
        this.sheepRetired = result.totalRetired;
      }
    } else {
      const result = updateSheepRetirements(
        this.sheep as Parameters<typeof updateSheepRetirements>[0],
        COOP_GATE,
        COOP_GATE.pasture
      );
      this.sheepRetired = result.totalRetired;
    }
  }

  private updateSheepMovement(sheep: SheepInternalState): void {
    const maxSpeed = this.sheepConfig.maxSpeed;
    const prevVel = sheep.velocity.clone();

    sheep.velocity.add(sheep.acceleration);
    sheep.velocity.limit(maxSpeed);
    sheep.velocity.multiply(0.98);

    const smoothed = prevVel.multiply(0.85).add(sheep.velocity.clone().multiply(0.15));

    if (smoothed.magnitude() > 0.001) {
      sheep.velocity = smoothed;
      // Time-based, calibrated to match original (which used deltaTime * 60)
      sheep.position.add(sheep.velocity.clone().multiply(DELTA_TIME * 60));
    } else {
      sheep.velocity.multiply(0);
    }

    sheep.acceleration.multiply(0);
  }

  private inGatePassageZone(sheep: SheepInternalState): boolean {
    if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
      for (const gate of this.competitiveGates) {
        const z = gate.passageZone;
        if (sheep.position.x >= z.minX && sheep.position.x <= z.maxX &&
            sheep.position.z >= z.minZ && sheep.position.z <= z.maxZ) {
          return true;
        }
      }
      return false;
    }
    const z = COOP_GATE.passageZone;
    return sheep.position.x >= z.minX && sheep.position.x <= z.maxX &&
           sheep.position.z >= z.minZ && sheep.position.z <= z.maxZ;
  }

  private shouldSeekGate(sheep: SheepInternalState): boolean {
    for (const dog of this.sheepdogs.values()) {
      if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
        let closest: (typeof this.competitiveGates)[0] | null = null;
        let closestDist = Infinity;
        for (const gate of this.competitiveGates) {
          const d = sheep.position.distanceTo(gate.position);
          if (d < closestDist) { closestDist = d; closest = gate; }
        }
        if (closest) {
          const distToDog = sheep.position.distanceTo(dog.position);
          if (distToDog < sheep.fleeRadius * 1.5 && closestDist < 30) {
            const toGate = closest.position.clone().subtract(sheep.position);
            const toDog = dog.position.clone().subtract(sheep.position);
            if (toGate.x * toDog.x + toGate.z * toDog.z < 0) return true;
          }
        }
      } else {
        const distToGate = sheep.position.distanceTo(COOP_GATE.position);
        const distToDog = sheep.position.distanceTo(dog.position);
        if (distToDog < sheep.fleeRadius * 1.5 && distToGate < 30) {
          const toGate = COOP_GATE.position.clone().subtract(sheep.position);
          const toDog = dog.position.clone().subtract(sheep.position);
          if (toGate.x * toDog.x + toGate.z * toDog.z < 0) return true;
        }
      }
    }
    return false;
  }

  private calcGateAttraction(sheep: SheepInternalState): Vector2D {
    let targetPos: Vector2D;
    if ((this.isCompetitive || this.isTimedMode) && this.competitiveGates.length > 0) {
      let closest: (typeof this.competitiveGates)[0] | null = null;
      let closestDist = Infinity;
      for (const gate of this.competitiveGates) {
        const d = sheep.position.distanceTo(gate.position);
        if (d < closestDist) { closestDist = d; closest = gate; }
      }
      if (!closest) return new Vector2D(0, 0);
      targetPos = closest.position;
    } else {
      targetPos = COOP_GATE.position;
    }

    const desired = targetPos.clone().subtract(sheep.position);
    desired.normalize().multiply(this.sheepConfig.maxSpeed);
    const steer = desired.subtract(sheep.velocity);
    steer.limit(this.sheepConfig.maxForce).multiply(sheep.gateAttraction);
    return steer;
  }

  // ---- Timed mode ----

  private updateTimedMode(currentTime: number): void {
    if (this.gameStartTime && currentTime - this.gameStartTime >= this.gameDuration) {
      if (!this.gameCompleted) {
        this.gameCompleted = true;
        const winner = this.getTopScorer();
        this.broadcastMsg({
          v: 1,
          t: 'complete',
          winner,
          scores: { ...this.playerScores },
          winType: 'timeout',
          totalSheep: 200,
        } as CompleteMsg);
        this.onGameComplete();
      }
    }

    // Process removal queue (sheep respawn after 5s)
    const toRemove: number[] = [];
    for (let i = this.sheepRemovalQueue.length - 1; i >= 0; i--) {
      const removal = this.sheepRemovalQueue[i];
      if (currentTime >= removal.removeTime) {
        toRemove.push(removal.sheepId);
        this.sheepRemovalQueue.splice(i, 1);
      }
    }
    for (const sheepId of toRemove) {
      const s = this.sheep.find(sh => sh.id === sheepId);
      if (s) {
        s.id = this.nextSheepId++;
        const spawnX = (Math.random() - 0.5) * 60;
        const spawnZ = (Math.random() - 0.5) * 60;
        s.position.set(spawnX, spawnZ);
        s.velocity.set(0, 0);
        s.acceleration.set(0, 0);
        s.hasPassedGate = false;
        s.isRetiring = false;
        s.state = 0;
        s.assignedGate = null;
        s.retirementTarget = null;
        s.scheduledForRemoval = false;
        s.disappearTime = undefined;
        // Remove old snapshot so delta encoder sends full state for this sheep
        this.prevSnapshots.delete(sheepId);
      }
    }
  }

  private updateTimedRetirements(): { playerRetirements: Record<string, number>; totalRetired: number } {
    let totalRetired = 0;
    const playerRetirements: Record<string, number> = {};
    for (const gate of this.competitiveGates) {
      if (gate.playerId) playerRetirements[gate.playerId] = 0;
    }

    const currentTime = Date.now();
    for (const sheep of this.sheep) {
      if (!sheep.hasPassedGate && !sheep.scheduledForRemoval) {
        for (const gate of this.competitiveGates) {
          if (checkGatePassage(sheep.position, sheep.velocity, gate.passageZone, gate.direction)) {
            sheep.hasPassedGate = true;
            sheep.isRetiring = true;
            sheep.state = 1;
            sheep.assignedGate = gate.id;
            sheep.scheduledForRemoval = true;
            sheep.disappearTime = currentTime + 5000;

            const margin = 3;
            sheep.retirementTarget = new Vector2D(
              gate.pasture.minX + margin + Math.random() * (gate.pasture.maxX - gate.pasture.minX - 2 * margin),
              gate.pasture.minZ + margin + Math.random() * (gate.pasture.maxZ - gate.pasture.minZ - 2 * margin)
            );

            if (gate.playerId && gate.playerId in playerRetirements) {
              playerRetirements[gate.playerId]++;
            }

            this.sheepRemovalQueue.push({ sheepId: sheep.id, removeTime: sheep.disappearTime! });
            break;
          }
        }
      }
      if (sheep.hasPassedGate || sheep.isRetiring) totalRetired++;
    }

    return { playerRetirements, totalRetired };
  }

  // ---- Completion ----

  private checkCompletion(): void {
    if (this.gameCompleted) return;

    if (this.isTimedMode) return; // timer handles completion

    if (this.isCompetitive) {
      const playerCount = Object.keys(this.playerScores).length;
      const result = checkCompetitiveCompletion(this.playerScores, playerCount, 200);
      if (result.isComplete) {
        this.gameCompleted = true;
        this.broadcastMsg({
          v: 1,
          t: 'complete',
          winner: result.winner,
          scores: result.finalScores || { ...this.playerScores },
          winType: result.winType || 'race',
          totalSheep: 200,
        } as CompleteMsg);
        this.onGameComplete();
      }
    } else {
      // Cooperative
      const result = checkGameCompletion(
        this.sheep as Parameters<typeof checkGameCompletion>[0],
        200,
        true
      );
      if (result.isComplete) {
        this.gameCompleted = true;
        this.broadcastMsg({
          v: 1,
          t: 'complete',
          winner: null,
          scores: { ...this.playerScores },
          sheepRetired: this.sheepRetired,
          totalSheep: 200,
        } as CompleteMsg);
        this.onGameComplete();
      }
    }
  }

  private onGameComplete(): void {
    // Mode cycling for public rooms
    if (this.room.isPublic && !this.room.modeLocked) {
      this.room.mode = MODE_CYCLE[this.room.mode] || 'cooperative';
    }
    this.room.state = 'waiting';
    this.sheep = [];
    this.sheepdogs.clear();
    this.dogConfigs.clear();
    this.prevSnapshots.clear();
    this.sendLobby();
    this.upsertLobby();
    // Stop alarm - no more ticks until next game
  }

  // ---- State broadcast with delta encoding ----

  private broadcastState(): void {
    const sheepDeltas: SheepDelta[] = [];

    for (const sheep of this.sheep) {
      const prev = this.prevSnapshots.get(sheep.id);
      const rx = Math.round(sheep.position.x * 100) / 100;
      const rz = Math.round(sheep.position.z * 100) / 100;

      const moved = !prev ||
        Math.abs(rx - prev.x) > SHEEP_DELTA_THRESHOLD ||
        Math.abs(rz - prev.z) > SHEEP_DELTA_THRESHOLD ||
        sheep.state !== prev.state ||
        sheep.hasPassedGate !== prev.hasPassedGate ||
        sheep.isRetiring !== prev.isRetiring;

      if (moved) {
        const delta: SheepDelta = {
          id: sheep.id,
          x: rx,
          z: rz,
          vx: Math.round(sheep.velocity.x * 100) / 100,
          vz: Math.round(sheep.velocity.z * 100) / 100,
          state: sheep.state,
          facing: Math.round(sheep.facingDirection * 100) / 100,
          hasPassedGate: sheep.hasPassedGate,
          isRetiring: sheep.isRetiring,
        };
        if (sheep.assignedGate !== null) delta.assignedGate = sheep.assignedGate;
        if (sheep.retirementTarget) {
          delta.targetX = Math.round(sheep.retirementTarget.x * 100) / 100;
          delta.targetZ = Math.round(sheep.retirementTarget.z * 100) / 100;
        }
        sheepDeltas.push(delta);

        this.prevSnapshots.set(sheep.id, {
          x: rx, z: rz, state: sheep.state,
          hasPassedGate: sheep.hasPassedGate, isRetiring: sheep.isRetiring,
        });
      }
    }

    const dogs: DogState[] = Array.from(this.sheepdogs.values()).map(dog => ({
      playerId: dog.id,
      dogType: dog.dogType,
      x: Math.round(dog.position.x * 100) / 100,
      z: Math.round(dog.position.z * 100) / 100,
      vx: Math.round(dog.velocity.x * 100) / 100,
      vz: Math.round(dog.velocity.z * 100) / 100,
      rotation: Math.round(dog.rotation * 100) / 100,
      stamina: Math.round(dog.stamina),
      sprinting: dog.isSprinting,
      sequence: dog.inputSequence,
    }));

    const stateMsg: StateMsg = {
      v: 1,
      t: 'state',
      tick: this.tickCount,
      sheepDeltas,
      dogs,
    };

    if (Object.keys(this.playerScores).length > 0) {
      stateMsg.scores = { ...this.playerScores };
    }

    if (this.isTimedMode && this.gameStartTime) {
      const remaining = Math.max(0, this.gameDuration - (Date.now() - this.gameStartTime));
      stateMsg.time = remaining;
    }

    this.broadcastMsg(stateMsg);
  }

  // ---- Helpers ----

  private getTopScorer(): string | null {
    let top: string | null = null;
    let best = -1;
    for (const [pid, score] of Object.entries(this.playerScores)) {
      if (score > best) { best = score; top = pid; }
    }
    return top;
  }

  private generateRoomCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 0; i < 3; i++) code += numbers.charAt(Math.floor(Math.random() * numbers.length));
    return code;
  }

  private broadcastMsg(msg: ServerMessage): void {
    const data = encode(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* ignore closed ws */ }
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(encode(msg)); } catch { /* ignore */ }
  }

  private sendError(ws: WebSocket, message: string): void {
    this.sendToWs(ws, { v: 1, t: 'error', msg: message } as ErrorMsg);
  }

  private sendLobby(): void {
    this.broadcastMsg(this.buildLobbyMsg());
  }

  private buildLobbyMsg(): LobbyMsg {
    return {
      v: 1,
      t: 'lobby',
      roomCode: this.room.roomCode,
      mode: this.room.mode,
      state: this.room.state,
      hostId: this.room.hostId,
      players: Array.from(this.room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        dogType: p.dogType,
        isHost: p.id === this.room.hostId,
      })),
      modeLocked: this.room.modeLocked,
    };
  }

  private getSerializableState() {
    return {
      roomCode: this.room.roomCode,
      mode: this.room.mode,
      state: this.room.state,
      hostId: this.room.hostId,
      players: Array.from(this.room.players.values()),
      modeLocked: this.room.modeLocked,
    };
  }

  // ---- LobbyDO integration ----

  private async upsertLobby(): Promise<void> {
    if (!this.room.isPublic || !this._env) return;
    try {
      const id = this._env.LOBBY_DO.idFromName('global');
      const stub = this._env.LOBBY_DO.get(id);
      const hostPlayer = this.room.hostId ? this.room.players.get(this.room.hostId) : null;
      await stub.fetch(new Request('http://internal/upsert', {
        method: 'POST',
        body: JSON.stringify({
          roomCode: this.room.roomCode,
          hostName: hostPlayer?.name || 'Host',
          playerCount: this.room.players.size,
          maxPlayers: 4,
          gameMode: this.room.mode,
          state: this.room.state,
        }),
      }));
    } catch (e) {
      console.error('RoomDO: failed to upsert lobby', e);
    }
  }

  private async removeLobby(): Promise<void> {
    if (!this.room.isPublic || !this._env) return;
    try {
      const id = this._env.LOBBY_DO.idFromName('global');
      const stub = this._env.LOBBY_DO.get(id);
      await stub.fetch(new Request('http://internal/remove', {
        method: 'POST',
        body: JSON.stringify({ roomCode: this.room.roomCode }),
      }));
    } catch (e) {
      console.error('RoomDO: failed to remove lobby', e);
    }
  }
}

interface Env {
  ROOM_DO: DurableObjectNamespace;
  LOBBY_DO: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
}
