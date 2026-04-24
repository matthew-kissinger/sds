// Shared fixtures for the two-client integration harness.
//
// These are synthetic personas used to drive the worker through a full
// create -> join -> start -> play -> complete cycle. Fields mirror what the
// (reconstructed) protocol-v2 contract requires from a REST register call
// and a WS upgrade.

export interface PlayerFixture {
  /** Stable identity stored in localStorage on a real client. */
  persistentId: string;
  /** Human-readable display name sent at register time. */
  playerName: string;
  /** Dog breed id; one of jep, rex, pip, luna, scout in the game. */
  dogType: string;
  /** What nameType the client reports to /api/register. */
  nameType: "custom" | "auto";
}

export const PLAYER_A: PlayerFixture = Object.freeze({
  persistentId: "test-persistent-a-00000000",
  playerName: "AliceHost",
  dogType: "jep",
  nameType: "custom",
});

export const PLAYER_B: PlayerFixture = Object.freeze({
  persistentId: "test-persistent-b-00000000",
  playerName: "BobGuest",
  dogType: "rex",
  nameType: "custom",
});

export const PLAYERS: readonly PlayerFixture[] = Object.freeze([
  PLAYER_A,
  PLAYER_B,
]);

/** Default room-creation body for Client A (the host). */
export function roomCreateBody(host: PlayerFixture, playerId: string) {
  return {
    playerId,
    playerName: host.playerName,
    dogType: host.dogType,
    mode: "cooperative" as const,
    isPublic: true,
  };
}

/** Default join body for a guest client. */
export function roomJoinBody(guest: PlayerFixture, playerId: string) {
  return {
    playerId,
    playerName: guest.playerName,
    dogType: guest.dogType,
  };
}

/** Shape of a valid register response from the worker (reconstructed). */
export interface RegisterResponse {
  token: string;
  playerId: string;
  displayName?: string;
  discriminator?: string;
}

/** Shape of a valid room-create response (reconstructed from C1 audit). */
export interface RoomCreateResponse {
  roomCode: string;
  playerId: string;
}

/** Minimal shape-check guards used by harness tests. Kept permissive so the
 *  retry can adjust the contract without rewriting the whole suite. */
export function isValidPlayerFixture(x: unknown): x is PlayerFixture {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f.persistentId === "string" &&
    f.persistentId.length > 0 &&
    typeof f.playerName === "string" &&
    f.playerName.length > 0 &&
    typeof f.dogType === "string" &&
    f.dogType.length > 0 &&
    (f.nameType === "custom" || f.nameType === "auto")
  );
}
