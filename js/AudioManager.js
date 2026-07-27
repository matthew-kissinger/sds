// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

const SOUND_FILES = Object.freeze({
    uiClick: 'assets/sounds_compressed/ui_click.mp3',
    rewardingChime: 'assets/sounds_compressed/rewarding_chime.mp3',
    scoreSound: 'assets/sounds_compressed/effect_score.mp3',
    opponentScoreSound: 'assets/sounds_compressed/effect_opponent_score.mp3',
    winSound: 'assets/sounds_compressed/music_victory.mp3',
    loseSound: 'assets/sounds_compressed/effect_lose.mp3',
});
const SHEEP_BLEAT_FILES = Object.freeze([
    'assets/sounds_compressed/sheep_bleat_agitated.mp3',
    'assets/sounds_compressed/sheep_bleat_short.mp3',
    'assets/sounds_compressed/sheep_bleat_cartoon.mp3',
    'assets/sounds_compressed/sheep_bleat_cheerful.mp3',
]);
const DOG_BARK_FILES = Object.freeze({
    jep: 'assets/sounds_compressed/dog_bark_jep.mp3',
    pip: 'assets/sounds_compressed/dog_bark_pip.mp3',
    sally: 'assets/sounds_compressed/dog_bark_sally.mp3',
    shiloh: 'assets/sounds_compressed/dog_bark_shiloh.mp3',
    george_washington: 'assets/sounds_compressed/dog_bark_george_washington.mp3',
});
const MUSIC_FILES = Object.freeze({
    gameplay1: 'assets/sounds_compressed/music_gameplay_1.mp3',
    gameplay2: 'assets/sounds_compressed/music_gameplay_2.mp3',
    gameplay3: 'assets/sounds_compressed/music_gameplay_3.mp3',
    competitive1: 'assets/sounds_compressed/music_competitive_1.mp3',
    competitive2: 'assets/sounds_compressed/music_competitive_2.mp3',
    competitiveEndgame: 'assets/sounds_compressed/music_competitive_endgame.mp3',
});

class StreamedMusicTrack {
    constructor(listener, path) {
        this.element = document.createElement('audio');
        this.element.preload = 'none';
        this.element.src = path;
        this.element.loop = true;
        this.output = new THREE.Audio(listener);
        this.output.setMediaElementSource(this.element);
    }

    get isPlaying() {
        return !this.element.paused && !this.element.ended;
    }

    setLoop(loop) {
        this.element.loop = loop;
    }

    setVolume(volume) {
        this.output.setVolume(volume);
    }

    getVolume() {
        return this.output.getVolume();
    }

    async play() {
        if (this.isPlaying) return true;
        try {
            await this.element.play();
            return true;
        } catch (error) {
            console.warn('[AUDIO] Streamed music playback failed:', error);
            return false;
        }
    }

    stop() {
        this.element.pause();
        this.element.currentTime = 0;
    }
}

/**
 * AudioManager - Handles all game audio with Three.js audio system
 * Provides simple interface for playing sounds with proper 3D audio support
 */
export class AudioManager {
    constructor(camera) {
        // Create audio listener and attach to camera
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);

        // Audio loader
        this.loader = new THREE.AudioLoader();

        // Audio context activation state
        this.audioContextActivated = false;

        // Audio objects for each sound
        this.sounds = {
            uiClick: null,
            rewardingChime: null,
            // Multiple sheep bleats for variety
            sheepBleats: [],
            // Dog-specific barking sounds
            dogBarks: {
                jep: null,
                pip: null,
                sally: null,
                shiloh: null,
                george_washington: null
            },
            // Competitive mode sounds
            scoreSound: null,
            opponentScoreSound: null,
            winSound: null,
            loseSound: null
        };

        // Music tracks
        this.music = {
            gameplay1: null,
            gameplay2: null,
            gameplay3: null,
            // Competitive mode music
            competitive1: null,
            competitive2: null,
            competitiveEndgame: null
        };

        // Track loading state
        this.isLoaded = false;
        this._assetLoads = new Map();
        this._soundLoads = new Map();
        this._sheepBleatLoad = null;
        this._musicTransitionToken = 0;
        this._activationInstalled = false;

        // Volume settings
        this.masterVolume = 0.7;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.5;

        // Specific volume multipliers for different sound types
        this.soundVolumeMultipliers = {
            uiClick: 1.0,
            rewardingChime: 1.0,
            sheepBleats: 0.25,       // Reduced from 0.5 to 0.25 (75% quieter)
            dogBarks: 0.6,
            scoreSound: 0.8,        // Scoring sound
            opponentScoreSound: 0.6, // Opponent scoring (quieter)
            winSound: 1.0,          // Victory sound
            loseSound: 0.8          // Loss sound
        };

        // Mute state
        this.isMuted = false;
        this.currentMusic = null; // Track currently playing music
        this.gameMode = 'solo'; // Track current game mode for music selection

        // Cooldown tracking to prevent sound spam
        this.lastPlayTimes = {
            sheepBleats: 0,
            dogBarks: 0,
            scoreSound: 0,
            opponentScoreSound: 0
        };
        this.cooldowns = {
            sheepBleats: 1500, // Increased from 500ms to 1500ms (3x less frequent)
            dogBarks: 1000,    // Increased from 300ms to 1000ms (3x less frequent)
            scoreSound: 200,   // 200ms cooldown for scoring sounds
            opponentScoreSound: 200
        };

        // Temporary audio objects pool for cleanup
        this.temporaryAudioObjects = new Set();

        // Load mute preference from localStorage
        this.loadMutePreference();

        // Setup audio context activation FIRST (before loading)
        this.setupAudioContextActivation();

        void this.loadSounds({ essential: true });
    }

    /**
     * Ensure audio context is running (required for mobile browsers)
     * Call this before any audio playback
     * @returns {Promise<boolean>} True if context is running
     */
    async ensureAudioContext() {
        if (!this.listener || !this.listener.context) {
            console.warn('[AUDIO] No audio context available');
            return false;
        }

        const context = this.listener.context;

        if (context.state === 'suspended') {
            try {
                await context.resume();
                this.audioContextActivated = true;
                console.log('[AUDIO] Audio context resumed successfully');
                return true;
            } catch (error) {
                console.warn('[AUDIO] Failed to resume audio context:', error);
                return false;
            }
        }

        if (context.state === 'running') {
            this.audioContextActivated = true;
            return true;
        }

        return false;
    }
    
    _loadBuffer(path) {
        if (this._assetLoads.has(path)) return this._assetLoads.get(path);
        const promise = this.loader.loadAsync(path).catch((error) => {
            this._assetLoads.delete(path);
            console.warn(`Failed to load audio ${path}:`, error);
            return null;
        });
        this._assetLoads.set(path, promise);
        return promise;
    }

    _loadSound(soundKey, path, volumeMultiplier) {
        if (this.sounds[soundKey]) return this.sounds[soundKey];
        if (this._soundLoads.has(soundKey)) return this._soundLoads.get(soundKey);
        const promise = this._loadBuffer(path).then((buffer) => {
            if (!buffer) return null;
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(this.masterVolume * this.sfxVolume * volumeMultiplier);
            this.sounds[soundKey] = sound;
            return sound;
        }).finally(() => this._soundLoads.delete(soundKey));
        this._soundLoads.set(soundKey, promise);
        return promise;
    }

    _loadDogBark(dogType) {
        const resolved = DOG_BARK_FILES[dogType] ? dogType : 'jep';
        if (this.sounds.dogBarks[resolved]) return this.sounds.dogBarks[resolved];
        const loadKey = `dogBark:${resolved}`;
        if (this._soundLoads.has(loadKey)) return this._soundLoads.get(loadKey);
        const promise = this._loadBuffer(DOG_BARK_FILES[resolved]).then((buffer) => {
            if (!buffer) return null;
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(this.masterVolume * this.sfxVolume * this.soundVolumeMultipliers.dogBarks);
            this.sounds.dogBarks[resolved] = sound;
            return sound;
        }).finally(() => this._soundLoads.delete(loadKey));
        this._soundLoads.set(loadKey, promise);
        return promise;
    }

    async loadSounds({ essential = false, dogType = null } = {}) {
        const loads = [];
        if (essential) {
            loads.push(this._loadSound('uiClick', SOUND_FILES.uiClick, this.soundVolumeMultipliers.uiClick));
        }
        if (dogType) loads.push(this._loadDogBark(dogType));
        await Promise.all(loads);
        this.isLoaded = true;
    }

    _loadSheepBleat() {
        if (this.sounds.sheepBleats.length) return this.sounds.sheepBleats[0];
        if (this._sheepBleatLoad) return this._sheepBleatLoad;
        const path = SHEEP_BLEAT_FILES[Math.floor(Math.random() * SHEEP_BLEAT_FILES.length)];
        this._sheepBleatLoad = this._loadBuffer(path).then((buffer) => {
            if (!buffer) return null;
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(this.masterVolume * this.sfxVolume * this.soundVolumeMultipliers.sheepBleats);
            this.sounds.sheepBleats.push(sound);
            return sound;
        }).finally(() => {
            this._sheepBleatLoad = null;
        });
        return this._sheepBleatLoad;
    }

    _loadGameplaySound(soundKey) {
        return this._loadSound(
            soundKey,
            SOUND_FILES[soundKey],
            this.soundVolumeMultipliers[soundKey] ?? 1,
        );
    }

    async loadMusic(musicKey) {
        if (!MUSIC_FILES[musicKey]) return null;
        if (this.music[musicKey]) return this.music[musicKey];
        const track = new StreamedMusicTrack(this.listener, MUSIC_FILES[musicKey]);
        track.setVolume(this.masterVolume * this.musicVolume);
        track.setLoop(true);
        this.music[musicKey] = track;
        return track;
    }

    _pickGameplayMusicKey() {
        const keys = this.gameMode === 'competitive'
            ? ['competitive1', 'competitive2']
            : ['gameplay1', 'gameplay2', 'gameplay3'];
        return keys[Math.floor(Math.random() * keys.length)];
    }

    async prepareRound(dogType, mode = 'solo') {
        this.gameMode = mode === 'multiplayer' ? 'competitive' : mode;
        void this.loadSounds({ dogType });
        return this.playGameplayMusic();
    }
    
    /**
     * Set the current game mode for appropriate music selection
     * @param {string} mode - Game mode ('solo', 'multiplayer', 'competitive')
     */
    setGameMode(mode) {
        this.gameMode = mode;
        console.log(`AudioManager game mode set to: ${mode}`);
    }
    
    /**
     * Play UI click sound
     * Ensures audio context is activated and sound is ready to play
     */
    playUIClick() {
        if (!this.sounds.uiClick) {
            void this.loadSounds({ essential: true }).then(() => this.playUIClick());
            return;
        }
        // Ensure audio context is activated on user interaction
        if (!this.audioContextActivated && this.listener.context.state === 'suspended') {
            this.listener.context.resume().then(() => {
                this.audioContextActivated = true;
                console.log('Audio context activated via UI click');
                
                // Play the click sound after activation
                if (this.sounds.uiClick && !this.sounds.uiClick.isPlaying) {
                    this.sounds.uiClick.play();
                }
            }).catch((error) => {
                console.warn('Failed to activate audio context on UI click:', error);
            });
        } else {
            // Audio context is ready, play immediately
            if (this.sounds.uiClick && !this.sounds.uiClick.isPlaying) {
                this.sounds.uiClick.play();
            }
        }
    }
    
    /**
     * Play rewarding chime sound (for sheep passing gate or game completion)
     */
    playRewardingChime() {
        if (!this.sounds.rewardingChime) {
            void this._loadGameplaySound('rewardingChime').then(() => this.playRewardingChime());
            return;
        }
        if (this.sounds.rewardingChime && !this.sounds.rewardingChime.isPlaying) {
            this.sounds.rewardingChime.play();
        }
    }
    
    /**
     * Play scoring sound for competitive mode
     */
    playScoreSound() {
        const now = Date.now();
        if (now - this.lastPlayTimes.scoreSound < this.cooldowns.scoreSound) {
            return; // Still in cooldown
        }
        
        if (!this.sounds.scoreSound) {
            void this._loadGameplaySound('scoreSound').then(() => this.playScoreSound());
            return;
        }
        if (!this.sounds.scoreSound.isPlaying) {
            this.sounds.scoreSound.play();
            this.lastPlayTimes.scoreSound = now;
        }
    }
    
    /**
     * Play opponent scoring sound for competitive mode
     */
    playOpponentScoreSound() {
        const now = Date.now();
        if (now - this.lastPlayTimes.opponentScoreSound < this.cooldowns.opponentScoreSound) {
            return; // Still in cooldown
        }
        
        if (!this.sounds.opponentScoreSound) {
            void this._loadGameplaySound('opponentScoreSound').then(() => this.playOpponentScoreSound());
            return;
        }
        if (!this.sounds.opponentScoreSound.isPlaying) {
            this.sounds.opponentScoreSound.play();
            this.lastPlayTimes.opponentScoreSound = now;
        }
    }
    
    /**
     * Play victory sound
     */
    playVictorySound() {
        if (!this.sounds.winSound) {
            void this._loadGameplaySound('winSound').then(() => this.playVictorySound());
            return;
        }
        if (this.sounds.winSound && !this.sounds.winSound.isPlaying) {
            this.sounds.winSound.play();
        }
    }
    
    /**
     * Play loss sound
     */
    playLossSound() {
        if (!this.sounds.loseSound) {
            void this._loadGameplaySound('loseSound').then(() => this.playLossSound());
            return;
        }
        if (this.sounds.loseSound && !this.sounds.loseSound.isPlaying) {
            this.sounds.loseSound.play();
        }
    }
    
    /**
     * Play sheep bleat sound with cooldown to prevent spam
     */
    playSheepBleat() {
        const now = Date.now();
        if (now - this.lastPlayTimes.sheepBleats < this.cooldowns.sheepBleats) {
            return; // Still in cooldown
        }
        
        if (this.sounds.sheepBleats.length === 0) {
            void this._loadSheepBleat().then(() => this.playSheepBleat());
            return;
        }

        // Randomly select a sheep bleat sound
        if (this.sounds.sheepBleats.length > 0) {
            const randomBleat = this.sounds.sheepBleats[Math.floor(Math.random() * this.sounds.sheepBleats.length)];
            
            if (randomBleat && !randomBleat.isPlaying) {
                randomBleat.play();
                this.lastPlayTimes.sheepBleats = now;
            }
        }
    }
    
    /**
     * Play multiple layered sheep bleats for group herding
     * @param {number} sheepCount - Number of sheep being chased (1-5 max for audio clarity)
     */
    playGroupSheepBleats(sheepCount) {
        const now = Date.now();
        if (now - this.lastPlayTimes.sheepBleats < this.cooldowns.sheepBleats) {
            return; // Still in cooldown
        }
        
        if (this.sounds.sheepBleats.length === 0) {
            void this._loadSheepBleat().then(() => this.playGroupSheepBleats(sheepCount));
            return;
        }
        
        // Limit to 5 simultaneous bleats for audio clarity
        const maxBleats = Math.min(sheepCount, 5);
        
        // Play first bleat immediately (random selection)
        const firstBleat = this.sounds.sheepBleats[Math.floor(Math.random() * this.sounds.sheepBleats.length)];
        if (firstBleat) {
            firstBleat.play();
        }
        
        // Schedule additional bleats with staggered timing
        for (let i = 1; i < maxBleats; i++) {
            setTimeout(() => {
                // Select a random bleat from our array
                const randomBleat = this.sounds.sheepBleats[Math.floor(Math.random() * this.sounds.sheepBleats.length)];
                if (randomBleat && randomBleat.buffer) {
                    // Create a new audio instance for overlapping sounds
                    const additionalBleat = new THREE.Audio(this.listener);
                    additionalBleat.setBuffer(randomBleat.buffer);

                    // Apply the same volume multiplier as the main sheep bleat sound
                    const baseVolume = this.isMuted ? 0 : this.masterVolume * this.sfxVolume;
                    const volumeMultiplier = this.soundVolumeMultipliers.sheepBleats || 0.5;
                    const finalVolume = baseVolume * volumeMultiplier * (0.7 + Math.random() * 0.3); // Slight volume variation

                    additionalBleat.setVolume(finalVolume);
                    additionalBleat.play();

                    // Track for cleanup and auto-dispose when finished
                    this.temporaryAudioObjects.add(additionalBleat);
                    additionalBleat.onEnded = () => {
                        this.temporaryAudioObjects.delete(additionalBleat);
                        additionalBleat.disconnect();
                    };
                }
            }, i * (100 + Math.random() * 150)); // 100-250ms staggered delays
        }
        
        this.lastPlayTimes.sheepBleats = now;
    }
    
    /**
     * Play dog bark sound with cooldown based on dog type
     * @param {string} dogType - Type of dog ('jep', 'pip', 'shiloh')
     */
    playSheepdogBark(dogType = 'jep', { force = false } = {}) {
        const now = Date.now();
        // A forced (player-commanded) bark bypasses the AudioManager's own
        // cooldown so the SFX always lands with the bark animation; the caller
        // (Sheepdog.triggerPlayerBark) owns the real rate limit. Passive barks
        // keep this cooldown as a throttle.
        if (!force && now - this.lastPlayTimes.dogBarks < this.cooldowns.dogBarks) {
            return; // Still in cooldown
        }

        const playLoadedBark = () => {
            const dogBark = this.sounds.dogBarks[dogType] || this.sounds.dogBarks.jep;
            if (!dogBark || typeof dogBark.play !== 'function') return;
            if (dogBark.isPlaying) {
                // Forced bark restarts the one-shot so it can't be swallowed
                // while a previous sample is still playing; a passive bark keeps
                // the old drop-if-busy behavior.
                if (!force || typeof dogBark.stop !== 'function') return;
                dogBark.stop();
            }
            dogBark.play();
            this.lastPlayTimes.dogBarks = Date.now();
            console.log(`[AUDIO] ${dogType} barked`);
        };

        Promise.all([this._loadDogBark(dogType), this.ensureAudioContext()])
            .then(([, ready]) => { if (ready) playLoadedBark(); });
    }
    
    /**
     * Play appropriate gameplay background music based on game mode
     */
    playGameplayMusic() {
        return this._playMusicKey(this._pickGameplayMusicKey());
    }
    
    /**
     * Play competitive endgame music for tense final moments
     */
    playCompetitiveEndgameMusic() {
        return this._playMusicKey('competitiveEndgame');
    }
    
    async _playMusicKey(musicKey) {
        const token = ++this._musicTransitionToken;
        const track = await this.loadMusic(musicKey);
        const ready = await this.ensureAudioContext();
        if (!track || !ready || token !== this._musicTransitionToken) return false;
        for (const candidate of Object.values(this.music)) {
            if (candidate && candidate !== track && candidate.isPlaying) candidate.stop();
        }
        this.currentMusic = track;
        const played = await track.play();
        if (!played || token !== this._musicTransitionToken) {
            track.stop();
            if (this.currentMusic === track) this.currentMusic = null;
            return false;
        }
        return true;
    }
    
    /**
     * Stop all music
     */
    stopAllMusic() {
        this._musicTransitionToken++;
        Object.values(this.music).forEach(track => {
            if (track && track.isPlaying) {
                track.stop();
            }
        });
        this.currentMusic = null;
    }
    
    /**
     * Fade out current music (smooth transition)
     */
    fadeOutCurrentMusic(duration = 1000) {
        if (!this.currentMusic || !this.currentMusic.isPlaying) return;

        const track = this.currentMusic;
        const token = ++this._musicTransitionToken;
        const startVolume = track.getVolume();
        const fadeSteps = 20;
        const stepDuration = duration / fadeSteps;
        const volumeStep = startVolume / fadeSteps;
        
        let currentStep = 0;
        const fadeInterval = setInterval(() => {
            if (token !== this._musicTransitionToken || this.currentMusic !== track) {
                clearInterval(fadeInterval);
                return;
            }

            currentStep++;
            const newVolume = startVolume - (volumeStep * currentStep);

            if (currentStep >= fadeSteps || newVolume <= 0) {
                if (this.currentMusic === track) {
                    track.stop();
                    track.setVolume(startVolume);
                    this.currentMusic = null;
                }
                clearInterval(fadeInterval);
            } else {
                track.setVolume(newVolume);
            }
        }, stepDuration);
    }
    
    /**
     * Set master volume (0.0 to 1.0)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    /**
     * Set SFX volume (0.0 to 1.0)
     */
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    /**
     * Set music volume (0.0 to 1.0)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    /**
     * Toggle mute state
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        // Stop all currently playing sounds when muting
        if (this.isMuted) {
            this.stopAllSounds();
            this.stopAllMusic();
        }
        
        this.updateAllVolumes();
        this.saveMutePreference();
        return this.isMuted;
    }
    
    /**
     * Set mute state
     */
    setMuted(muted) {
        this.isMuted = muted;
        
        // Stop all currently playing sounds when muting
        if (this.isMuted) {
            this.stopAllSounds();
            this.stopAllMusic();
        }
        
        this.updateAllVolumes();
        this.saveMutePreference();
    }
    
    /**
     * Get current mute state
     */
    isMutedState() {
        return this.isMuted;
    }
    
    /**
     * Load mute preference from localStorage
     */
    loadMutePreference() {
        try {
            const saved = localStorage.getItem('sheepdog-muted');
            if (saved !== null) {
                this.isMuted = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Failed to load mute preference:', error);
            this.isMuted = false;
        }
    }
    
    /**
     * Save mute preference to localStorage
     */
    saveMutePreference() {
        try {
            localStorage.setItem('sheepdog-muted', JSON.stringify(this.isMuted));
        } catch (error) {
            console.warn('Failed to save mute preference:', error);
        }
    }
    
    /**
     * Update volume for all loaded sounds and music
     */
    updateAllVolumes() {
        const effectiveVolume = this.isMuted ? 0 : this.masterVolume;
        const baseSFXVolume = effectiveVolume * this.sfxVolume;
        const finalMusicVolume = effectiveVolume * this.musicVolume;
        
        // Update sound effects with specific volume multipliers
        Object.keys(this.sounds).forEach(soundKey => {
            const sound = this.sounds[soundKey];
            
            if (Array.isArray(sound)) {
                // Handle sheep bleats array
                const volumeMultiplier = this.soundVolumeMultipliers[soundKey] || 1.0;
                sound.forEach(soundItem => {
                    if (soundItem && soundItem.setVolume) {
                        soundItem.setVolume(baseSFXVolume * volumeMultiplier);
                    }
                });
            } else if (sound && typeof sound === 'object' && sound.jep !== undefined) {
                // Handle dog barks object
                const volumeMultiplier = this.soundVolumeMultipliers[soundKey] || 1.0;
                Object.values(sound).forEach(barkSound => {
                    if (barkSound && barkSound.setVolume) {
                        barkSound.setVolume(baseSFXVolume * volumeMultiplier);
                    }
                });
            } else if (sound && sound.setVolume) {
                // Handle regular sounds
                const volumeMultiplier = this.soundVolumeMultipliers[soundKey] || 1.0;
                sound.setVolume(baseSFXVolume * volumeMultiplier);
            }
        });
        
        // Update music
        Object.values(this.music).forEach(track => {
            if (track && track.setVolume) {
                track.setVolume(finalMusicVolume);
            }
        });
    }
    
    /**
     * Stop all currently playing sounds
     */
    stopAllSounds() {
        Object.values(this.sounds).forEach(sound => {
            if (Array.isArray(sound)) {
                // Handle sheep bleats array
                sound.forEach(soundItem => {
                    if (soundItem && soundItem.isPlaying) {
                        soundItem.stop();
                    }
                });
            } else if (sound && typeof sound === 'object' && sound.jep !== undefined) {
                // Handle dog barks object
                Object.values(sound).forEach(barkSound => {
                    if (barkSound && barkSound.isPlaying) {
                        barkSound.stop();
                    }
                });
            } else if (sound && sound.isPlaying) {
                // Handle regular sounds
                sound.stop();
            }
        });
    }
    
    /**
     * Check if audio system is ready
     */
    isReady() {
        return this.isLoaded;
    }
    
    /**
     * Set up audio context activation on user interaction
     * Modern web audio best practice: activate on ANY user interaction
     */
    setupAudioContextActivation() {
        if (this._activationInstalled) return;
        this._activationInstalled = true;
        this.audioContextActivated = false;

        const interactionEvents = ['click', 'keydown', 'touchstart'];
        const activateAudio = () => {
            for (const eventType of interactionEvents) {
                document.removeEventListener(eventType, activateAudio);
            }
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume().then(() => {
                    console.log('Audio context activated');
                    this.audioContextActivated = true;
                }).catch((error) => {
                    console.warn('Failed to activate audio context:', error);
                });
            } else {
                this.audioContextActivated = true;
            }
        };

        interactionEvents.forEach(eventType => {
            document.addEventListener(eventType, activateAudio);
        });
    }
    
    /**
     * Get audio context state (for debugging)
     */
    getAudioContextState() {
        return this.listener.context.state;
    }
}
