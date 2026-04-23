const db = require('better-sqlite3')('leaderboard.db');
const players = db.prepare('SELECT * FROM players').all();
const discriminators = db.prepare('SELECT * FROM discriminators').all();

const esc = v => {
  if (v === null) return 'NULL';
  if (typeof v === 'string') return "'" + v.replace(/'/g, "''") + "'";
  return v;
};

const lines = ['BEGIN TRANSACTION;'];
for (const p of players) {
  const vals = [
    p.persistent_id, p.display_name, p.discriminator, p.full_name,
    p.created_at, p.last_active, p.solo_classic_best, p.solo_extreme_best,
    p.timed_best, p.competitive_wins, p.cooperative_best
  ].map(esc).join(',');
  lines.push(`INSERT OR IGNORE INTO players (persistent_id,display_name,discriminator,full_name,created_at,last_active,solo_classic_best,solo_extreme_best,timed_best,competitive_wins,cooperative_best) VALUES (${vals});`);
}
for (const d of discriminators) {
  lines.push(`INSERT OR IGNORE INTO discriminators (display_name,discriminator) VALUES (${esc(d.display_name)},${esc(d.discriminator)});`);
}
lines.push('COMMIT;');

require('fs').writeFileSync('migrate.sql', lines.join('\n'));
console.log(players.length + ' players, ' + discriminators.length + ' discriminators written to migrate.sql');
db.close();
