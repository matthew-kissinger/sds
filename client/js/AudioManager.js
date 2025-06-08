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
            sheepBleat: null,
            sheepdogBark: null
        };
        
        // Music tracks
        this.music = {
            startMusic: null,
            gameplay1: null,
            gameplay2: null,
            gameplay3: null,
            winMusic: null
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
            sheepBleat: 0.5,        // 50% lower than normal
            sheepdogBark: 0.5       // 50% lower than normal
        };
        
        // Mute state
        this.isMuted = false;
        this.currentMusic = null; // Track currently playing music
        
        // Cooldown tracking to prevent sound spam
        this.lastPlayTimes = {
            sheepBleat: 0,
            sheepdogBark: 0
        };
        this.cooldowns = {
            sheepBleat: 500, // 500ms cooldown
            sheepdogBark: 300 // 300ms cooldown
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
            uiClick: 'assets/sounds/11L-clean_UI_click,_wood-1748393658157.mp3',
            rewardingChime: 'assets/sounds/11L-short_rewarding_chim-1748393597911.mp3',
            sheepBleat: 'assets/sounds/11L-agitated_sheep_bleat-1748393501154.mp3',
            sheepdogBark: 'assets/sounds/11L-short_sharp_sheep_do-1748393459422.mp3'
        };
        
        // Load each sound
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
        
        // Wait for all sounds to load
        Promise.all(this.loadingPromises).then(() => {
            this.isLoaded = true;
            console.log('All sounds loaded successfully');
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
            startMusic: 'assets/sounds/SDS Start Music.wav',
            gameplay1: 'assets/sounds/SDS1.wav',
            gameplay2: 'assets/sounds/SDS2.wav',
            gameplay3: 'assets/sounds/SDS3.wav',
            winMusic: 'assets/sounds/win.wav'
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
     * Play sheep bleat sound with cooldown to prevent spam
     */
    playSheepBleat() {
        const now = Date.now();
        if (now - this.lastPlayTimes.sheepBleat < this.cooldowns.sheepBleat) {
            return; // Still in cooldown
        }
        
        if (this.sounds.sheepBleat && !this.sounds.sheepBleat.isPlaying) {
            this.sounds.sheepBleat.play();
            this.lastPlayTimes.sheepBleat = now;
        }
    }
    
    /**
     * Play multiple layered sheep bleats for group herding
     * @param {number} sheepCount - Number of sheep being chased (1-5 max for audio clarity)
     */
    playGroupSheepBleats(sheepCount) {
        const now = Date.now();
        if (now - this.lastPlayTimes.sheepBleat < this.cooldowns.sheepBleat) {
            return; // Still in cooldown
        }
        
        // Limit to 5 simultaneous bleats for audio clarity
        const maxBleats = Math.min(sheepCount, 5);
        
        // Play first bleat immediately
        if (this.sounds.sheepBleat) {
            this.sounds.sheepBleat.play();
        }
        
        // Schedule additional bleats with staggered timing
        for (let i = 1; i < maxBleats; i++) {
            setTimeout(() => {
                if (this.sounds.sheepBleat) {
                    // Create a new audio instance for overlapping sounds
                    const additionalBleat = new THREE.Audio(this.listener);
                    additionalBleat.setBuffer(this.sounds.sheepBleat.buffer);
                    
                    // Apply the same volume multiplier as the main sheep bleat sound
                    const baseVolume = this.isMuted ? 0 : this.masterVolume * this.sfxVolume;
                    const volumeMultiplier = this.soundVolumeMultipliers.sheepBleat || 1.0;
                    const finalVolume = baseVolume * volumeMultiplier * (0.7 + Math.random() * 0.3); // Slight volume variation
                    
                    additionalBleat.setVolume(finalVolume);
                    additionalBleat.play();
                }
            }, i * (100 + Math.random() * 150)); // 100-250ms staggered delays
        }
        
        this.lastPlayTimes.sheepBleat = now;
    }
    
    /**
     * Play sheepdog bark sound with cooldown
     */
    playSheepdogBark() {
        const now = Date.now();
        if (now - this.lastPlayTimes.sheepdogBark < this.cooldowns.sheepdogBark) {
            return; // Still in cooldown
        }
        
        if (this.sounds.sheepdogBark && !this.sounds.sheepdogBark.isPlaying) {
            this.sounds.sheepdogBark.play();
            this.lastPlayTimes.sheepdogBark = now;
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
     * Play random gameplay background music
     */
    playGameplayMusic() {
        const gameplayTracks = [this.music.gameplay1, this.music.gameplay2, this.music.gameplay3];
        const randomTrack = gameplayTracks[Math.floor(Math.random() * gameplayTracks.length)];
        
        if (randomTrack && !randomTrack.isPlaying) {
            this.stopAllMusic();
            this.currentMusic = randomTrack;
            randomTrack.play();
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
            if (sound && sound.setVolume) {
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
            if (sound && sound.isPlaying) {
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