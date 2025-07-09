/**
 * LeaderboardManager - Persistent Player Identity and Leaderboard System
 * Handles player registration, score tracking, and leaderboard queries
 * Uses SQLite for persistent storage
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class LeaderboardManager {
    constructor() {
        // Initialize SQLite database
        const dbPath = path.join(__dirname, 'leaderboard.db');
        this.db = new Database(dbPath);
        
        // Enable WAL mode for better performance
        this.db.pragma('journal_mode = WAL');
        
        // Create tables if they don't exist
        this.initializeDatabase();
        
        // Prepare statements for better performance
        this.prepareStatements();
        
        // Cache for frequent operations
        this.discriminatorCache = new Map();
        
        // Random name generation components
        this.adjectives = [
            'Swift', 'Clever', 'Brave', 'Mighty', 'Gentle', 'Wise', 'Bold', 'Quick', 
            'Steady', 'Silent', 'Golden', 'Silver', 'Shadow', 'Storm', 'Wind', 
            'Mountain', 'Valley', 'River', 'Forest', 'Meadow', 'Highland', 'Prairie',
            'Noble', 'Keen', 'Fierce', 'Calm', 'Sharp', 'Bright', 'Strong', 'Fast'
        ];
        
        this.herderNames = [
            'Shepherd', 'Herder', 'Ranger', 'Guardian', 'Warden', 'Guide', 'Scout', 
            'Driver', 'Keeper', 'Walker', 'Runner', 'Chaser', 'Leader', 'Master', 
            'Whisperer', 'Friend', 'Helper', 'Trainer', 'Handler', 'Border', 'Collie',
            'Aussie', 'Corgi', 'Sheepdog', 'Herdsman', 'Drover', 'Cowboy', 'Rancher'
        ];
        
        // Load discriminator cache from database
        this.loadDiscriminatorCache();
        
        console.log('✅ LeaderboardManager initialized with SQLite database');
    }

    /**
     * Initialize database tables
     */
    initializeDatabase() {
        // Players table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS players (
                persistent_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                discriminator TEXT NOT NULL,
                full_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_active INTEGER NOT NULL,
                solo_classic_best REAL,
                solo_extreme_best REAL,
                timed_best INTEGER,
                competitive_wins INTEGER DEFAULT 0,
                cooperative_best REAL
            )
        `);

        // Discriminators table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS discriminators (
                display_name TEXT,
                discriminator TEXT,
                PRIMARY KEY (display_name, discriminator)
            )
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_players_display_name ON players(display_name);
            CREATE INDEX IF NOT EXISTS idx_players_last_active ON players(last_active);
            CREATE INDEX IF NOT EXISTS idx_players_solo_classic ON players(solo_classic_best);
            CREATE INDEX IF NOT EXISTS idx_players_solo_extreme ON players(solo_extreme_best);
            CREATE INDEX IF NOT EXISTS idx_players_timed ON players(timed_best);
            CREATE INDEX IF NOT EXISTS idx_players_competitive ON players(competitive_wins);
            CREATE INDEX IF NOT EXISTS idx_players_cooperative ON players(cooperative_best);
        `);
    }

    /**
     * Prepare SQL statements for better performance
     */
    prepareStatements() {
        // Player operations
        this.stmts = {
            // Player queries
            getPlayer: this.db.prepare('SELECT * FROM players WHERE persistent_id = ?'),
            insertPlayer: this.db.prepare(`
                INSERT INTO players (
                    persistent_id, display_name, discriminator, full_name, 
                    created_at, last_active, solo_classic_best, solo_extreme_best, 
                    timed_best, competitive_wins, cooperative_best
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            updatePlayerActivity: this.db.prepare('UPDATE players SET last_active = ? WHERE persistent_id = ?'),
            
            // Score updates
            updateSoloClassic: this.db.prepare('UPDATE players SET solo_classic_best = ?, last_active = ? WHERE persistent_id = ?'),
            updateSoloExtreme: this.db.prepare('UPDATE players SET solo_extreme_best = ?, last_active = ? WHERE persistent_id = ?'),
            updateTimed: this.db.prepare('UPDATE players SET timed_best = ?, last_active = ? WHERE persistent_id = ?'),
            updateCompetitive: this.db.prepare('UPDATE players SET competitive_wins = competitive_wins + ?, last_active = ? WHERE persistent_id = ?'),
            updateCooperative: this.db.prepare('UPDATE players SET cooperative_best = ?, last_active = ? WHERE persistent_id = ?'),
            
            // Discriminator operations
            getDiscriminators: this.db.prepare('SELECT discriminator FROM discriminators WHERE display_name = ?'),
            insertDiscriminator: this.db.prepare('INSERT INTO discriminators (display_name, discriminator) VALUES (?, ?)'),
            
            // Leaderboard queries
            getLeaderboardSoloClassic: this.db.prepare(`
                SELECT * FROM players 
                WHERE solo_classic_best IS NOT NULL 
                ORDER BY solo_classic_best ASC 
                LIMIT ?
            `),
            getLeaderboardSoloExtreme: this.db.prepare(`
                SELECT * FROM players 
                WHERE solo_extreme_best IS NOT NULL 
                ORDER BY solo_extreme_best ASC 
                LIMIT ?
            `),
            getLeaderboardTimed: this.db.prepare(`
                SELECT * FROM players 
                WHERE timed_best IS NOT NULL 
                ORDER BY timed_best DESC 
                LIMIT ?
            `),
            getLeaderboardCompetitive: this.db.prepare(`
                SELECT * FROM players 
                WHERE competitive_wins > 0 
                ORDER BY competitive_wins DESC 
                LIMIT ?
            `),
            getLeaderboardCooperative: this.db.prepare(`
                SELECT * FROM players 
                WHERE cooperative_best IS NOT NULL 
                ORDER BY cooperative_best ASC 
                LIMIT ?
            `),
            
            // Statistics queries
            countPlayers: this.db.prepare('SELECT COUNT(*) as count FROM players'),
            countActivePlayersLastWeek: this.db.prepare('SELECT COUNT(*) as count FROM players WHERE last_active > ?'),
            countPlayersWithScores: this.db.prepare('SELECT COUNT(*) as count FROM players WHERE ? IS NOT NULL'),
            countDiscriminators: this.db.prepare('SELECT COUNT(*) as count FROM discriminators')
        };
    }

    /**
     * Load discriminator cache from database
     */
    loadDiscriminatorCache() {
        const discriminators = this.db.prepare('SELECT display_name, discriminator FROM discriminators').all();
        
        for (const row of discriminators) {
            if (!this.discriminatorCache.has(row.display_name)) {
                this.discriminatorCache.set(row.display_name, new Set());
            }
            this.discriminatorCache.get(row.display_name).add(row.discriminator);
        }
    }

    /**
     * Generate a random herding-themed name
     */
    generateRandomName() {
        const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
        const herderName = this.herderNames[Math.floor(Math.random() * this.herderNames.length)];
        return `${adjective}${herderName}`;
    }

    /**
     * Get next available discriminator for a display name
     */
    getNextDiscriminator(displayName) {
        if (!this.discriminatorCache.has(displayName)) {
            this.discriminatorCache.set(displayName, new Set());
        }
        
        const usedDiscriminators = this.discriminatorCache.get(displayName);
        
        // Find next available discriminator starting from 0001
        for (let i = 1; i <= 9999; i++) {
            const discriminator = String(i).padStart(4, '0');
            if (!usedDiscriminators.has(discriminator)) {
                // Add to cache and database
                usedDiscriminators.add(discriminator);
                this.stmts.insertDiscriminator.run(displayName, discriminator);
                return discriminator;
            }
        }
        
        // Fallback if somehow all 9999 are taken
        return '9999';
    }

    /**
     * Register a new player or get existing player
     */
    registerPlayer(persistentId, displayName, nameType = 'custom') {
        // Check if player already exists
        const existingPlayer = this.stmts.getPlayer.get(persistentId);
        if (existingPlayer) {
            // Update last active time
            this.stmts.updatePlayerActivity.run(Date.now(), persistentId);
            return this.dbRowToPlayerProfile(existingPlayer);
        }
        
        // Handle different name types
        let finalDisplayName = displayName;
        if (nameType === 'random') {
            finalDisplayName = this.generateRandomName();
        } else if (nameType === 'anonymous') {
            finalDisplayName = 'Player';
        }
        
        // Get discriminator
        const discriminator = this.getNextDiscriminator(finalDisplayName);
        const fullName = `${finalDisplayName}#${discriminator}`;
        
        // Create new player profile
        const now = Date.now();
        this.stmts.insertPlayer.run(
            persistentId,
            finalDisplayName,
            discriminator,
            fullName,
            now,
            now,
            null, // solo_classic_best
            null, // solo_extreme_best
            null, // timed_best
            0,    // competitive_wins
            null  // cooperative_best
        );
        
        const playerProfile = {
            persistentId: persistentId,
            displayName: finalDisplayName,
            discriminator: discriminator,
            fullName: fullName,
            createdAt: now,
            lastActive: now,
            soloClassicBest: null,
            soloExtremeBest: null,
            timedBest: null,
            competitiveWins: 0,
            cooperativeBest: null
        };
        
        console.log(`🆔 Player registered: ${fullName} (${persistentId})`);
        return playerProfile;
    }

    /**
     * Convert database row to player profile object
     */
    dbRowToPlayerProfile(row) {
        return {
            persistentId: row.persistent_id,
            displayName: row.display_name,
            discriminator: row.discriminator,
            fullName: row.full_name,
            createdAt: row.created_at,
            lastActive: row.last_active,
            soloClassicBest: row.solo_classic_best,
            soloExtremeBest: row.solo_extreme_best,
            timedBest: row.timed_best,
            competitiveWins: row.competitive_wins,
            cooperativeBest: row.cooperative_best
        };
    }

    /**
     * Submit a score for a specific game mode
     */
    submitScore(persistentId, gameMode, score, additionalData = {}) {
        const player = this.stmts.getPlayer.get(persistentId);
        if (!player) {
            throw new Error('Player not found. Please register first.');
        }
        
        const now = Date.now();
        let updated = false;
        let isNewRecord = false;
        
        switch (gameMode) {
            case 'soloClassic':
                if (player.solo_classic_best === null || score < player.solo_classic_best) {
                    this.stmts.updateSoloClassic.run(score, now, persistentId);
                    player.solo_classic_best = score;
                    updated = true;
                    isNewRecord = true;
                }
                break;
                
            case 'soloExtreme':
                if (player.solo_extreme_best === null || score < player.solo_extreme_best) {
                    this.stmts.updateSoloExtreme.run(score, now, persistentId);
                    player.solo_extreme_best = score;
                    updated = true;
                    isNewRecord = true;
                }
                break;
                
            case 'timed':
                if (player.timed_best === null || score > player.timed_best) {
                    this.stmts.updateTimed.run(score, now, persistentId);
                    player.timed_best = score;
                    updated = true;
                    isNewRecord = true;
                }
                break;
                
            case 'competitive':
                // Increment wins counter
                this.stmts.updateCompetitive.run(score, now, persistentId); // score should be 1 for a win
                player.competitive_wins += score;
                updated = true;
                isNewRecord = false; // Wins are cumulative, not records
                break;
                
            case 'cooperative':
                if (player.cooperative_best === null || score < player.cooperative_best) {
                    this.stmts.updateCooperative.run(score, now, persistentId);
                    player.cooperative_best = score;
                    updated = true;
                    isNewRecord = true;
                }
                break;
                
            default:
                throw new Error(`Unknown game mode: ${gameMode}`);
        }
        
        // Update last active time if not already updated
        if (updated && gameMode !== 'competitive') {
            player.last_active = now;
        }
        
        if (updated) {
            console.log(`📊 Score updated for ${player.full_name}: ${gameMode} = ${score}${isNewRecord ? ' (NEW RECORD!)' : ''}`);
        }
        
        return { updated, isNewRecord, player: this.dbRowToPlayerProfile(player) };
    }

    /**
     * Get the correct database column name for a game mode
     */
    getScoreColumn(gameMode) {
        switch (gameMode) {
            case 'soloClassic': return 'solo_classic_best';
            case 'soloExtreme': return 'solo_extreme_best';
            case 'timed': return 'timed_best';
            case 'competitive': return 'competitive_wins';
            case 'cooperative': return 'cooperative_best';
            default: throw new Error(`Unknown game mode: ${gameMode}`);
        }
    }

    /**
     * Get leaderboard for a specific game mode
     */
    getLeaderboard(gameMode, limit = 10) {
        const validModes = ['soloClassic', 'soloExtreme', 'timed', 'competitive', 'cooperative'];
        if (!validModes.includes(gameMode)) {
            throw new Error(`Invalid game mode: ${gameMode}`);
        }
        
        let players;
        switch (gameMode) {
            case 'soloClassic':
                players = this.stmts.getLeaderboardSoloClassic.all(limit);
                break;
            case 'soloExtreme':
                players = this.stmts.getLeaderboardSoloExtreme.all(limit);
                break;
            case 'timed':
                players = this.stmts.getLeaderboardTimed.all(limit);
                break;
            case 'competitive':
                players = this.stmts.getLeaderboardCompetitive.all(limit);
                break;
            case 'cooperative':
                players = this.stmts.getLeaderboardCooperative.all(limit);
                break;
        }
        
        // Format results
        return players.map((player, index) => {
            const scoreKey = this.getScoreColumn(gameMode);
            const score = player[scoreKey];
            
            // Debug logging to see what score values we're getting
            console.log(`🔍 Score debug for ${player.display_name}: ${gameMode} -> ${scoreKey} = ${score} (type: ${typeof score})`);
            
            return {
                rank: index + 1,
                displayName: player.display_name,
                fullName: player.full_name,
                score: score,
                formattedScore: this.formatScore(gameMode, score),
                lastActive: player.last_active
            };
        });
    }

    /**
     * Format score based on game mode
     */
    formatScore(gameMode, score) {
        // Handle null/undefined scores
        if (score === null || score === undefined || isNaN(score)) {
            return 'No score';
        }
        
        switch (gameMode) {
            case 'soloClassic':
            case 'soloExtreme':
            case 'cooperative':
                // Format time in MM:SS
                const minutes = Math.floor(score / 60);
                const seconds = Math.floor(score % 60);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
            case 'timed':
                return `${score} sheep`;
                
            case 'competitive':
                return `${score} wins`;
                
            default:
                return score.toString();
        }
    }

    /**
     * Get player profile by persistent ID
     */
    getPlayer(persistentId) {
        const player = this.stmts.getPlayer.get(persistentId);
        return player ? this.dbRowToPlayerProfile(player) : null;
    }

    /**
     * Get all leaderboards
     */
    getAllLeaderboards(limit = 10) {
        return {
            soloClassic: this.getLeaderboard('soloClassic', limit),
            soloExtreme: this.getLeaderboard('soloExtreme', limit),
            timed: this.getLeaderboard('timed', limit),
            competitive: this.getLeaderboard('competitive', limit),
            cooperative: this.getLeaderboard('cooperative', limit)
        };
    }

    /**
     * Get leaderboard statistics
     */
    getStats() {
        const totalPlayers = this.stmts.countPlayers.get().count;
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const activePlayersLastWeek = this.stmts.countActivePlayersLastWeek.get(weekAgo).count;
        
        const modeStats = {
            soloClassic: this.stmts.countPlayersWithScores.get('solo_classic_best').count,
            soloExtreme: this.stmts.countPlayersWithScores.get('solo_extreme_best').count,
            timed: this.stmts.countPlayersWithScores.get('timed_best').count,
            competitive: this.stmts.countPlayersWithScores.get('competitive_wins').count,
            cooperative: this.stmts.countPlayersWithScores.get('cooperative_best').count
        };
        
        const totalDiscriminators = this.stmts.countDiscriminators.get().count;
        
        return {
            totalPlayers,
            activePlayersLastWeek,
            modeStats,
            totalDiscriminators
        };
    }

    /**
     * Save to persistent storage (SQLite handles this automatically)
     */
    async save() {
        // SQLite handles persistence automatically
        // Force a checkpoint to ensure WAL is written to main database
        this.db.pragma('wal_checkpoint(FULL)');
        console.log(`💾 Database checkpoint completed for ${this.stmts.countPlayers.get().count} player profiles`);
    }

    /**
     * Load from persistent storage (happens automatically on startup)
     */
    async load() {
        // SQLite loads data automatically
        // This method is kept for compatibility
        const playerCount = this.stmts.countPlayers.get().count;
        console.log(`📂 Database loaded with ${playerCount} player profiles`);
    }

    /**
     * Close database connection (for graceful shutdown)
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('📊 SQLite database connection closed');
        }
    }

    /**
     * Database maintenance operations
     */
    performMaintenance() {
        try {
            // Analyze database for query optimization
            this.db.exec('ANALYZE');
            
            // WAL checkpoint to merge changes
            this.db.pragma('wal_checkpoint(PASSIVE)');
            
            // Vacuum if needed (compact database)
            const pageCount = this.db.pragma('page_count');
            const freelistCount = this.db.pragma('freelist_count');
            const fragmentationRatio = freelistCount / pageCount;
            
            if (fragmentationRatio > 0.1) {
                console.log('🧹 Database fragmentation detected, running VACUUM...');
                this.db.exec('VACUUM');
            }
            
            console.log('🔧 Database maintenance completed');
        } catch (error) {
            console.error('❌ Database maintenance error:', error);
        }
    }
}
