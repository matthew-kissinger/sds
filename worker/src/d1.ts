// D1 leaderboard operations. Ports server/LeaderboardManager.js semantics:
//   - register inserts a players row (bug 3 fix)
//   - submitScore updates materialized best in one statement (bug 2 fix)

export interface PlayerRow {
  persistent_id: string;
  display_name: string;
  discriminator: string;
  full_name: string;
  created_at: number;
  last_active: number;
  solo_classic_best: number | null;
  solo_extreme_best: number | null;
  timed_best: number | null;
  competitive_wins: number;
  cooperative_best: number | null;
}

export type GameMode = 'soloClassic' | 'soloExtreme' | 'timed' | 'competitive' | 'cooperative';

const ADJECTIVES = [
  'Swift', 'Clever', 'Brave', 'Mighty', 'Gentle', 'Wise', 'Bold', 'Quick',
  'Steady', 'Silent', 'Golden', 'Silver', 'Shadow', 'Storm', 'Wind',
  'Mountain', 'Valley', 'River', 'Forest', 'Meadow', 'Highland', 'Prairie',
  'Noble', 'Keen', 'Fierce', 'Calm', 'Sharp', 'Bright', 'Strong', 'Fast',
];

const HERDER_NAMES = [
  'Shepherd', 'Herder', 'Ranger', 'Guardian', 'Warden', 'Guide', 'Scout',
  'Driver', 'Keeper', 'Walker', 'Runner', 'Chaser', 'Leader', 'Master',
  'Whisperer', 'Friend', 'Helper', 'Trainer', 'Handler', 'Border', 'Collie',
  'Aussie', 'Corgi', 'Sheepdog', 'Herdsman', 'Drover', 'Cowboy', 'Rancher',
];

export function generateRandomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const h = HERDER_NAMES[Math.floor(Math.random() * HERDER_NAMES.length)];
  return `${a}${h}`;
}

async function allocateDiscriminator(db: D1Database, displayName: string): Promise<string> {
  const { results } = await db
    .prepare('SELECT discriminator FROM discriminators WHERE display_name = ?')
    .bind(displayName)
    .all<{ discriminator: string }>();
  const used = new Set((results || []).map(r => r.discriminator));
  for (let i = 1; i <= 9999; i++) {
    const disc = String(i).padStart(4, '0');
    if (!used.has(disc)) {
      await db
        .prepare('INSERT INTO discriminators (display_name, discriminator) VALUES (?, ?)')
        .bind(displayName, disc)
        .run();
      return disc;
    }
  }
  return '9999';
}

export async function registerPlayer(
  db: D1Database,
  persistentId: string,
  requestedName: string,
  nameType: 'custom' | 'random' | 'anonymous',
): Promise<PlayerRow> {
  const existing = await db
    .prepare('SELECT * FROM players WHERE persistent_id = ?')
    .bind(persistentId)
    .first<PlayerRow>();
  if (existing) {
    const now = Date.now();
    await db
      .prepare('UPDATE players SET last_active = ? WHERE persistent_id = ?')
      .bind(now, persistentId)
      .run();
    existing.last_active = now;
    return existing;
  }

  let displayName = requestedName;
  if (nameType === 'random') displayName = generateRandomName();
  else if (nameType === 'anonymous') displayName = 'Player';

  const discriminator = await allocateDiscriminator(db, displayName);
  const fullName = `${displayName}#${discriminator}`;
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO players
       (persistent_id, display_name, discriminator, full_name, created_at, last_active,
        solo_classic_best, solo_extreme_best, timed_best, competitive_wins, cooperative_best)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, NULL)`,
    )
    .bind(persistentId, displayName, discriminator, fullName, now, now)
    .run();

  return {
    persistent_id: persistentId,
    display_name: displayName,
    discriminator,
    full_name: fullName,
    created_at: now,
    last_active: now,
    solo_classic_best: null,
    solo_extreme_best: null,
    timed_best: null,
    competitive_wins: 0,
    cooperative_best: null,
  };
}

export async function getPlayer(db: D1Database, persistentId: string): Promise<PlayerRow | null> {
  return (
    (await db
      .prepare('SELECT * FROM players WHERE persistent_id = ?')
      .bind(persistentId)
      .first<PlayerRow>()) || null
  );
}

export interface SubmitScoreResult {
  updated: boolean;
  isNewRecord: boolean;
  player: PlayerRow | null;
}

export async function submitScore(
  db: D1Database,
  persistentId: string,
  gameMode: GameMode,
  score: number,
  additionalData: Record<string, unknown> = {},
): Promise<SubmitScoreResult> {
  const player = await getPlayer(db, persistentId);
  if (!player) throw new Error('Player not found. Please register first.');

  // Score bounds validation (matches server/LeaderboardManager.js).
  switch (gameMode) {
    case 'soloClassic':
    case 'soloExtreme':
    case 'cooperative':
      if (!(score >= 30 && score <= 3600)) throw new Error(`score out of bounds for mode ${gameMode}`);
      break;
    case 'timed':
      if (!(Number.isInteger(score) && score >= 0 && score <= 500)) throw new Error(`score out of bounds for mode ${gameMode}`);
      break;
    case 'competitive':
      if (!(score === 0 || score === 1)) throw new Error(`score out of bounds for mode ${gameMode}`);
      break;
  }

  const now = Date.now();
  let updated = false;
  let isNewRecord = false;
  const roomCode = typeof additionalData.roomCode === 'string' ? additionalData.roomCode : null;

  // Audit row + materialized-best in a D1 batch so they land together.
  const stmts: D1PreparedStatement[] = [];
  stmts.push(
    db.prepare(
      'INSERT INTO score_submissions (persistent_id, game_mode, score, submitted_at, room_code, additional_data) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(persistentId, gameMode, score, now, roomCode, JSON.stringify(additionalData || {})),
  );

  switch (gameMode) {
    case 'soloClassic':
      if (player.solo_classic_best === null || score < player.solo_classic_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_classic_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_classic_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'soloExtreme':
      if (player.solo_extreme_best === null || score < player.solo_extreme_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_extreme_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_extreme_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'timed':
      if (player.timed_best === null || score > player.timed_best) {
        stmts.push(
          db.prepare('UPDATE players SET timed_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.timed_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'competitive':
      stmts.push(
        db.prepare('UPDATE players SET competitive_wins = competitive_wins + ?, last_active = ? WHERE persistent_id = ?')
          .bind(score, now, persistentId),
      );
      player.competitive_wins += score;
      updated = true;
      isNewRecord = false;
      break;
    case 'cooperative':
      if (player.cooperative_best === null || score < player.cooperative_best) {
        stmts.push(
          db.prepare('UPDATE players SET cooperative_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.cooperative_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
  }

  await db.batch(stmts);

  if (updated) player.last_active = now;
  return { updated, isNewRecord, player };
}

export function scoreColumn(mode: GameMode): string {
  switch (mode) {
    case 'soloClassic': return 'solo_classic_best';
    case 'soloExtreme': return 'solo_extreme_best';
    case 'timed': return 'timed_best';
    case 'competitive': return 'competitive_wins';
    case 'cooperative': return 'cooperative_best';
  }
}

export function formatScore(mode: GameMode, score: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'No score';
  switch (mode) {
    case 'soloClassic':
    case 'soloExtreme':
    case 'cooperative': {
      const m = Math.floor(score / 60);
      const s = Math.floor(score % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    case 'timed':
      return `${score} sheep`;
    case 'competitive':
      return `${score} wins`;
  }
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  fullName: string;
  score: number;
  formattedScore: string;
  persistent_id: string;
  lastActive: number;
}

export async function getLeaderboard(
  db: D1Database,
  mode: GameMode,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  let sql: string;
  switch (mode) {
    case 'soloClassic':
      sql = 'SELECT * FROM players WHERE solo_classic_best IS NOT NULL ORDER BY solo_classic_best ASC LIMIT ?';
      break;
    case 'soloExtreme':
      sql = 'SELECT * FROM players WHERE solo_extreme_best IS NOT NULL ORDER BY solo_extreme_best ASC LIMIT ?';
      break;
    case 'timed':
      sql = 'SELECT * FROM players WHERE timed_best IS NOT NULL ORDER BY timed_best DESC LIMIT ?';
      break;
    case 'competitive':
      sql = 'SELECT * FROM players WHERE competitive_wins > 0 ORDER BY competitive_wins DESC LIMIT ?';
      break;
    case 'cooperative':
      sql = 'SELECT * FROM players WHERE cooperative_best IS NOT NULL ORDER BY cooperative_best ASC LIMIT ?';
      break;
  }
  const { results } = await db.prepare(sql).bind(limit).all<PlayerRow>();
  const col = scoreColumn(mode);
  return (results || []).map((p, i) => {
    const score = (p as any)[col] ?? 0;
    return {
      rank: i + 1,
      displayName: p.display_name,
      fullName: p.full_name,
      score,
      formattedScore: formatScore(mode, score),
      persistent_id: p.persistent_id,
      lastActive: p.last_active,
    };
  });
}

export async function getAllLeaderboards(db: D1Database, limit = 10): Promise<Record<string, LeaderboardEntry[]>> {
  const modes: GameMode[] = ['soloClassic', 'soloExtreme', 'timed', 'competitive', 'cooperative'];
  const results = await Promise.all(modes.map(m => getLeaderboard(db, m, limit)));
  const out: Record<string, LeaderboardEntry[]> = {};
  for (let i = 0; i < modes.length; i++) out[modes[i]] = results[i];
  return out;
}
