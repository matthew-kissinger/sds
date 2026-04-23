/**
 * SDS Wire Protocol v1
 * MessagePack over WebSocket. All messages include v:1 at top level.
 * Direction: C->S = client to server, S->C = server to client.
 */

// ---- Client -> Server ----

export interface InputMsg {
  v: 1;
  t: 'input';
  seq: number;
  dir: { x: number; z: number };
  sprint: boolean;
  clientPos?: { x: number; z: number };
}

export interface ReadyMsg {
  v: 1;
  t: 'ready';
}

export interface StartMsg {
  v: 1;
  t: 'start';
}

export interface LeaveMsg {
  v: 1;
  t: 'leave';
}

export interface ModeLockMsg {
  v: 1;
  t: 'modeLock';
  locked: boolean;
}

export interface SetDogMsg {
  v: 1;
  t: 'setDog';
  dogType: string;
}

export type ClientMessage = InputMsg | ReadyMsg | StartMsg | LeaveMsg | ModeLockMsg | SetDogMsg;

// ---- Server -> Client ----

export interface SheepDelta {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  state: number;
  facing: number;
  hasPassedGate: boolean;
  isRetiring: boolean;
  assignedGate?: number;
  targetX?: number;
  targetZ?: number;
}

export interface DogState {
  playerId: string;
  dogType: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rotation: number;
  stamina: number;
  sprinting: boolean;
  sequence: number;
}

export interface CompetitiveGateInfo {
  id: number;
  x: number;
  z: number;
  playerId: string | null;
  color: number;
  direction: string;
  pasture: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface StateMsg {
  v: 1;
  t: 'state';
  tick: number;
  sheepDeltas: SheepDelta[];
  dogs: DogState[];
  scores?: Record<string, number>;
  time?: number;
}

export interface LobbyPlayerInfo {
  id: string;
  name: string;
  dogType: string;
  isHost: boolean;
}

export interface LobbyMsg {
  v: 1;
  t: 'lobby';
  roomCode: string;
  mode: string;
  state: 'waiting' | 'in-game' | 'finished';
  hostId: string | null;
  players: LobbyPlayerInfo[];
  modeLocked: boolean;
}

export interface GameStartMsg {
  v: 1;
  t: 'start';
  mode: string;
  playerIds: string[];
  competitiveGates?: CompetitiveGateInfo[];
}

export interface CompleteMsg {
  v: 1;
  t: 'complete';
  winner: string | null;
  scores: Record<string, number>;
  winType?: string;
  sheepRetired?: number;
  totalSheep?: number;
}

export interface HostChangedMsg {
  v: 1;
  t: 'hostChanged';
  newHost: string;
}

export interface ErrorMsg {
  v: 1;
  t: 'error';
  msg: string;
}

export type ServerMessage =
  | StateMsg
  | LobbyMsg
  | GameStartMsg
  | CompleteMsg
  | HostChangedMsg
  | ErrorMsg;
