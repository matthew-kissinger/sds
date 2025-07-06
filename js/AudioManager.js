import * as THREE from 'three';

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
                rauri: null
            },
            // Competitive mode sounds
            scoreSound: null,
            opponentScoreSound: null,
            winSound: null,
            loseSound: null
        };
        
        // Music tracks
        this.music = {
            startMusic: null,
            gameplay1: null,
            gameplay2: null,
            gameplay3: null,
            winMusic: null,
            // Competitive mode music
            competitive1: null,
            competitive2: null,
            competitiveEndgame: null
        };
        
        // Track loading state
        this.isLoaded = false;
        this.musicLoaded = false;
        this.loadingPromises = [];
        this.musicLoadingPromises = [];
        
        // Volume settings
        this.masterVolume = 0.7;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.5;
        
        // Specific volume multipliers for different sound types
        this.soundVolumeMultipliers = {
            uiClick: 1.0,
            rewardingChime: 1.0,
            sheepBleats: 0.25,       // Reduced from 0.5 to 0.25 (75% quieter)
            dogBarks: 0.25,          // Reduced from 0.5 to 0.25 (75% quieter)
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
        
        // Load mute preference from localStorage
        this.loadMutePreference();
        
        this.loadSounds();
        this.loadMusic();
    }
    
    /**
     * Load all sound files
     */
    loadSounds() {
        const soundFiles = {
            uiClick: 'assets/sounds_compressed/ui_click.mp3',
            rewardingChime: 'assets/sounds_compressed/rewarding_chime.mp3',
            // Competitive mode sounds
            scoreSound: 'assets/sounds_compressed/effect_score.mp3',
            opponentScoreSound: 'assets/sounds_compressed/effect_opponent_score.mp3',
            winSound: 'assets/sounds_compressed/music_victory.mp3',
            loseSound: 'assets/sounds_compressed/effect_lose.mp3'
        };

        // Multiple sheep bleat sound files for variety
        const sheepBleatFiles = [
            'assets/sounds_compressed/sheep_bleat_agitated.mp3',
            'assets/sounds_compressed/sheep_bleat_short.mp3',
            'assets/sounds_compressed/sheep_bleat_cartoon.mp3',
            'assets/sounds_compressed/sheep_bleat_cheerful.mp3'
        ];

        // Dog-specific bark sound files
        const dogBarkFiles = {
            jep: 'assets/sounds_compressed/dog_bark_jep.mp3',
            pip: 'assets/sounds_compressed/dog_bark_pip.mp3',
            rauri: 'assets/sounds_compressed/dog_bark_rauri.mp3'
        };
        
        // Load regular sound files
        Object.keys(soundFiles).forEach(soundKey => {
            const promise = new Promise((resolve, reject) => {
                this.loader.load(
                    soundFiles[soundKey],
                    (buffer) => {
                        // Create Audio object
                        this.sounds[soundKey] = new THREE.Audio(this.listener);
                        this.sounds[soundKey].setBuffer(buffer);
                        
                        // Apply specific volume multiplier for this sound type
                        const volumeMultiplier = this.soundVolumeMultipliers[soundKey] || 1.0;
                        this.sounds[soundKey].setVolume(this.masterVolume * this.sfxVolume * volumeMultiplier);
                        
                        console.log(`Loaded sound: ${soundKey}`);
                        resolve();
                    },
                    (progress) => {
                        // Loading progress
                    },
                    (error) => {
                        console.warn(`Failed to load sound ${soundKey}:`, error);
                        // Create a dummy audio object to prevent errors
                        this.sounds[soundKey] = { 
                            play: () => {}, 
                            stop: () => {}, 
                            isPlaying: false 
                        };
                        resolve(); // Resolve anyway to not block other sounds
                    }
                );
            });
            
            this.loadingPromises.push(promise);
        });

        // Load sheep bleat sounds
        sheepBleatFiles.forEach((filePath, index) => {
            const promise = new Promise((resolve, reject) => {
                this.loader.load(
                    filePath,
                    (buffer) => {
                        // Create Audio object and add to sheep bleats array
                        const sheepBleat = new THREE.Audio(this.listener);
                        sheepBleat.setBuffer(buffer);
                        
                        // Apply sheep bleat volume multiplier
                        const volumeMultiplier = this.soundVolumeMultipliers.sheepBleats || 0.5;
                        sheepBleat.setVolume(this.masterVolume * this.sfxVolume * volumeMultiplier);
                        
                        this.sounds.sheepBleats.push(sheepBleat);
                        
                        console.log(`Loaded sheep bleat ${index + 1}: ${filePath.split('/').pop()}`);
                        resolve();
                    },
                    (progress) => {
                        // Loading progress
                    },
                    (error) => {
                        console.warn(`Failed to load sheep bleat ${filePath}:`, error);
                        // Create a dummy audio object to prevent errors
                        this.sounds.sheepBleats.push({ 
                            play: () => {}, 
                            stop: () => {}, 
                            isPlaying: false 
                        });
                        resolve(); // Resolve anyway to not block other sounds
                    }
                );
            });
            
            this.loadingPromises.push(promise);
        });

        // Load dog bark sounds
        Object.keys(dogBarkFiles).forEach(dogType => {
            const promise = new Promise((resolve, reject) => {
                this.loader.load(
                    dogBarkFiles[dogType],
                    (buffer) => {
                        // Create Audio object for this dog type
                        this.sounds.dogBarks[dogType] = new THREE.Audio(this.listener);
                        this.sounds.dogBarks[dogType].setBuffer(buffer);
                        
                        // Apply dog bark volume multiplier
                        const volumeMultiplier = this.soundVolumeMultipliers.dogBarks || 0.5;
                        this.sounds.dogBarks[dogType].setVolume(this.masterVolume * this.sfxVolume * volumeMultiplier);
                        
                        console.log(`Loaded dog bark for ${dogType}: ${dogBarkFiles[dogType].split('/').pop()}`);
                        resolve();
                    },
                    (progress) => {
                        // Loading progress
                    },
                    (error) => {
                        console.warn(`Failed to load dog bark for ${dogType}:`, error);
                        // Create a dummy audio object to prevent errors
                        this.sounds.dogBarks[dogType] = { 
                            play: () => {}, 
                            stop: () => {}, 
                            isPlaying: false 
                        };
                        resolve(); // Resolve anyway to not block other sounds
                    }
                );
            });
            
            this.loadingPromises.push(promise);
        });
        
        // Wait for all sounds to load
        Promise.all(this.loadingPromises).then(() => {
            this.isLoaded = true;
            console.log(`All sounds loaded successfully: ${this.sounds.sheepBleats.length} sheep bleats, ${Object.keys(this.sounds.dogBarks).length} dog barks`);
        }).catch((error) => {
            console.warn('Some sounds failed to load:', error);
            this.isLoaded = true; // Still mark as loaded to allow game to continue
        });
    }
    
    /**
     * Load all music files
     */
    loadMusic() {
        const musicFiles = {
            startMusic: 'assets/sounds_compressed/music_start.mp3',
            gameplay1: 'assets/sounds_compressed/music_gameplay_1.mp3',
            gameplay2: 'assets/sounds_compressed/music_gameplay_2.mp3',
            gameplay3: 'assets/sounds_compressed/music_gameplay_3.mp3',
            winMusic: 'assets/sounds_compressed/music_victory.mp3',
            // Competitive mode music
            competitive1: 'assets/sounds_compressed/music_competitive_1.mp3',
            competitive2: 'assets/sounds_compressed/music_competitive_2.mp3',
            competitiveEndgame: 'assets/sounds_compressed/music_competitive_endgame.mp3'
        };
        
        // Load each music track
        Object.keys(musicFiles).forEach(musicKey => {
            const promise = new Promise((resolve, reject) => {
                this.loader.load(
                    musicFiles[musicKey],
                    (buffer) => {
                        // Create Audio object
                        this.music[musicKey] = new THREE.Audio(this.listener);
                        this.music[musicKey].setBuffer(buffer);
                        this.music[musicKey].setVolume(this.masterVolume * this.musicVolume);
                        this.music[musicKey].setLoop(true); // Most music should loop
                        
                        console.log(`Loaded music: ${musicKey}`);
                        resolve();
                    },
                    (progress) => {
                        // Loading progress
                        console.log(`Loading music ${musicKey}: ${Math.round(progress.loaded / progress.total * 100)}%`);
                    },
                    (error) => {
                        console.warn(`Failed to load music ${musicKey}:`, error);
                        // Create a dummy audio object to prevent errors
                        this.music[musicKey] = { 
                            play: () => {}, 
                            stop: () => {}, 
                            pause: () => {},
                            setLoop: () => {},
                            setVolume: () => {},
                            isPlaying: false 
                        };
                        resolve(); // Resolve anyway to not block other music
                    }
                );
            });
            
            this.musicLoadingPromises.push(promise);
        });
        
        // Wait for all music to load
        Promise.all(this.musicLoadingPromises).then(() => {
            this.musicLoaded = true;
            console.log('All music loaded successfully');
            
            // Apply mute state to music
            this.updateAllVolumes();
            
            // Set up user interaction listener to start audio context
            this.setupAudioContextActivation();
        }).catch((error) => {
            console.warn('Some music failed to load:', error);
            this.musicLoaded = true; // Still mark as loaded to allow game to continue
        });
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
     */
    playUIClick() {
        if (this.sounds.uiClick && !this.sounds.uiClick.isPlaying) {
            this.sounds.uiClick.play();
        }
    }
    
    /**
     * Play rewarding chime sound (for sheep passing gate or game completion)
     */
    playRewardingChime() {
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
        
        if (this.sounds.scoreSound && !this.sounds.scoreSound.isPlaying) {
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
        
        if (this.sounds.opponentScoreSound && !this.sounds.opponentScoreSound.isPlaying) {
            this.sounds.opponentScoreSound.play();
            this.lastPlayTimes.opponentScoreSound = now;
        }
    }
    
    /**
     * Play victory sound
     */
    playVictorySound() {
        if (this.sounds.winSound && !this.sounds.winSound.isPlaying) {
            this.sounds.winSound.play();
        }
    }
    
    /**
     * Play loss sound
     */
    playLossSound() {
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
        
        if (this.sounds.sheepBleats.length === 0) return;
        
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
                }
            }, i * (100 + Math.random() * 150)); // 100-250ms staggered delays
        }
        
        this.lastPlayTimes.sheepBleats = now;
    }
    
    /**
     * Play dog bark sound with cooldown based on dog type
     * @param {string} dogType - Type of dog ('jep', 'pip', 'rauri')
     */
    playSheepdogBark(dogType = 'jep') {
        const now = Date.now();
        if (now - this.lastPlayTimes.dogBarks < this.cooldowns.dogBarks) {
            return; // Still in cooldown
        }
        
        // Use the specific dog's bark sound
        const dogBark = this.sounds.dogBarks[dogType] || this.sounds.dogBarks.jep; // Fallback to jep
        
        if (dogBark && !dogBark.isPlaying) {
            dogBark.play();
            this.lastPlayTimes.dogBarks = now;
            console.log(`🐕 ${dogType} barked!`);
        }
    }
    
    /**
     * Play start screen music
     */
    playStartMusic() {
        if (this.music.startMusic && !this.music.startMusic.isPlaying) {
            this.stopAllMusic();
            this.currentMusic = this.music.startMusic;
            this.music.startMusic.play();
        }
    }
    
    /**
     * Play appropriate gameplay background music based on game mode
     */
    playGameplayMusic() {
        let gameplayTracks;
        
        if (this.gameMode === 'competitive') {
            // Use competitive music tracks
            gameplayTracks = [this.music.competitive1, this.music.competitive2];
        } else {
            // Use normal gameplay tracks
            gameplayTracks = [this.music.gameplay1, this.music.gameplay2, this.music.gameplay3];
        }
        
        const randomTrack = gameplayTracks[Math.floor(Math.random() * gameplayTracks.length)];
        
        if (randomTrack && !randomTrack.isPlaying) {
            this.stopAllMusic();
            this.currentMusic = randomTrack;
            randomTrack.play();
        }
    }
    
    /**
     * Play competitive endgame music for tense final moments
     */
    playCompetitiveEndgameMusic() {
        if (this.music.competitiveEndgame && !this.music.competitiveEndgame.isPlaying) {
            this.stopAllMusic();
            this.currentMusic = this.music.competitiveEndgame;
            this.music.competitiveEndgame.play();
        }
    }
    
    /**
     * Play win music (doesn't loop)
     */
    playWinMusic() {
        if (this.music.winMusic) {
            this.stopAllMusic();
            this.currentMusic = this.music.winMusic;
            this.music.winMusic.setLoop(false); // Win music plays once
            this.music.winMusic.play();
        }
    }
    
    /**
     * Stop all music
     */
    stopAllMusic() {
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
        
        const startVolume = this.currentMusic.getVolume();
        const fadeSteps = 20;
        const stepDuration = duration / fadeSteps;
        const volumeStep = startVolume / fadeSteps;
        
        let currentStep = 0;
        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = startVolume - (volumeStep * currentStep);
            
            if (currentStep >= fadeSteps || newVolume <= 0) {
                this.currentMusic.stop();
                this.currentMusic.setVolume(startVolume); // Reset volume for next play
                this.currentMusic = null;
                clearInterval(fadeInterval);
            } else {
                this.currentMusic.setVolume(newVolume);
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
     * Check if music system is ready
     */
    isMusicReady() {
        return this.musicLoaded;
    }
    
    /**
     * Set up audio context activation on user interaction
     */
    setupAudioContextActivation() {
        this.audioContextActivated = false;
        
        const activateAudio = (event) => {
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume().then(() => {
                    console.log('Audio context activated');
                    this.audioContextActivated = true;
                    
                    // Only start music if this wasn't the start button click
                    const isStartButton = event.target && (
                        event.target.id === 'start-button' || 
                        event.target.closest('#start-button')
                    );
                    
                    if (this.musicLoaded && !this.currentMusic && !isStartButton) {
                        this.playStartMusic();
                    }
                });
            } else {
                this.audioContextActivated = true;
            }
            
            // Remove listeners after first activation
            document.removeEventListener('click', activateAudio);
            document.removeEventListener('keydown', activateAudio);
        };
        
        // Listen for any user interaction
        document.addEventListener('click', activateAudio);
        document.addEventListener('keydown', activateAudio);
    }
    
    /**
     * Manually trigger start music (for delayed start)
     */
    triggerStartMusic() {
        if (this.musicLoaded && !this.currentMusic && this.audioContextActivated) {
            this.playStartMusic();
        }
    }
    
    /**
     * Get audio context state (for debugging)
     */
    getAudioContextState() {
        return this.listener.context.state;
    }
}
