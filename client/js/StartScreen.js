import * as THREE from 'three';

/**
 * StartScreen - Manages the start screen overlay and pre-game state
 */
export class StartScreen {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.isActive = true;
        this.gameStarted = false;
        this.audioManager = null;
        
        // Cinematic camera settings
        this.cinematicCamera = {
            angle: 0,
            radius: 120,
            height: 80,
            speed: 0.05,
            centerX: 0,
            centerZ: 0
        };
        
        // UI elements
        this.startScreenElement = document.getElementById('start-screen');
        this.startButton = document.getElementById('start-button');
        this.gameUIElements = document.querySelectorAll('.game-ui');
        this.musicNote = document.getElementById('music-note');
        
        this.init();
    }
    
    init() {
        // Set up start button event listener
        this.startButton.addEventListener('click', () => {
            this.startGame();
        });
        
        // Set up keyboard listener for Enter key
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' && this.isActive) {
                this.startGame();
            }
        });
        
        // Set up mute button
        this.setupMuteButton();
        
        // Set up music activation
        this.setupMusicActivation();
        
        // Initialize cinematic camera
        this.setupCinematicCamera();
    }
    
    setupCinematicCamera() {
        // Position camera for cinematic view of the field
        const camera = this.sceneManager.getCamera();
        camera.position.set(
            this.cinematicCamera.centerX + this.cinematicCamera.radius,
            this.cinematicCamera.height,
            this.cinematicCamera.centerZ
        );
        camera.lookAt(this.cinematicCamera.centerX, 0, this.cinematicCamera.centerZ);
    }
    
    updateCinematicCamera() {
        if (!this.isActive) return;
        
        // Slowly orbit around the field center
        this.cinematicCamera.angle += this.cinematicCamera.speed * 0.016; // Assuming 60fps
        
        const camera = this.sceneManager.getCamera();
        const x = this.cinematicCamera.centerX + Math.cos(this.cinematicCamera.angle) * this.cinematicCamera.radius;
        const z = this.cinematicCamera.centerZ + Math.sin(this.cinematicCamera.angle) * this.cinematicCamera.radius;
        
        // Smooth camera movement
        const targetPosition = new THREE.Vector3(x, this.cinematicCamera.height, z);
        camera.position.lerp(targetPosition, 0.02);
        
        // Always look at the center of the field
        const lookAtTarget = new THREE.Vector3(this.cinematicCamera.centerX, 0, this.cinematicCamera.centerZ);
        const currentLookAt = new THREE.Vector3();
        camera.getWorldDirection(currentLookAt);
        currentLookAt.multiplyScalar(-1).add(camera.position);
        currentLookAt.lerp(lookAtTarget, 0.02);
        camera.lookAt(currentLookAt);
    }
    
    startGame() {
        if (!this.isActive) return;
        
        // Play UI click sound
        if (this.audioManager) {
            this.audioManager.playUIClick();
            
            // Fade out start music and start gameplay music
            this.audioManager.fadeOutCurrentMusic(800);
            setTimeout(() => {
                this.audioManager.playGameplayMusic();
            }, 900); // Start gameplay music after fade out
        }
        
        this.isActive = false;
        this.gameStarted = true;
        
        // Hide start screen with animation
        this.startScreenElement.style.transition = 'opacity 0.8s ease-out';
        this.startScreenElement.style.opacity = '0';
        
        setTimeout(() => {
            this.startScreenElement.style.display = 'none';
            
            // Show game UI elements
            this.gameUIElements.forEach(element => {
                element.classList.add('visible');
            });
        }, 800);
        
        // Trigger game start callback if set
        if (this.onGameStart) {
            this.onGameStart();
        }
    }
    
    setGameStartCallback(callback) {
        this.onGameStart = callback;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        
        // Update mute button state
        this.updateMuteButton();
    }
    
    setupMuteButton() {
        this.muteToggle = document.getElementById('mute-toggle');
        if (this.muteToggle) {
            this.muteToggle.addEventListener('click', () => {
                if (this.audioManager) {
                    const isMuted = this.audioManager.toggleMute();
                    this.updateMuteButton();
                }
            });
        }
    }
    
    updateMuteButton() {
        if (!this.muteToggle || !this.audioManager) return;
        
        const isMuted = this.audioManager.isMutedState();
        const icon = isMuted ? '🔇' : '🔊';
        this.muteToggle.innerHTML = `${icon} <strong>Click</strong> - Toggle Sound`;
        this.muteToggle.title = isMuted ? 'Click to unmute sound' : 'Click to mute sound';
        
        if (isMuted) {
            this.muteToggle.classList.add('muted');
        } else {
            this.muteToggle.classList.remove('muted');
        }
    }
    
    setupMusicActivation() {
        // Listen for clicks on the start screen (but not the start button)
        const handleStartScreenClick = (event) => {
            // Don't trigger music if clicking the start button
            if (event.target.id === 'start-button' || event.target.closest('#start-button')) {
                return;
            }
            
            // Trigger music and hide the note
            if (this.audioManager && this.isActive) {
                this.audioManager.triggerStartMusic();
                if (this.musicNote) {
                    this.musicNote.style.display = 'none';
                }
            }
        };
        
        // Add click listener to start screen
        if (this.startScreenElement) {
            this.startScreenElement.addEventListener('click', handleStartScreenClick);
        }
    }
    
    isStartScreenActive() {
        return this.isActive;
    }
    
    hasGameStarted() {
        return this.gameStarted;
    }
    
    reset() {
        this.isActive = true;
        this.gameStarted = false;
        
        // Show start screen
        this.startScreenElement.style.display = 'flex';
        this.startScreenElement.style.opacity = '1';
        this.startScreenElement.style.transition = 'none';
        
        // Hide game UI elements
        this.gameUIElements.forEach(element => {
            element.classList.remove('visible');
        });
        
        // Reset cinematic camera
        this.cinematicCamera.angle = 0;
        this.setupCinematicCamera();
    }
} 