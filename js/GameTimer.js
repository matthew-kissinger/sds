/**
 * GameTimer - Handles timer functionality and best time tracking
 */
export class GameTimer {
    constructor() {
        this.startTime = null;
        this.currentTime = 0;
        this.timerRunning = false;
        this.isPaused = false;
        this.pausedTime = 0; // Total time spent paused
        this.pauseStartTime = null;
        this.bestTime = this.loadBestTime();
        
        this.initializeTimer();
    }
    
    initializeTimer() {
        this.updateTimerDisplay();
        this.updateBestTimeDisplay();
    }
    
    start() {
        if (!this.timerRunning) {
            this.startTime = performance.now();
            this.timerRunning = true;
            this.pausedTime = 0; // Reset paused time when starting
        }
    }
    
    stop() {
        if (this.timerRunning) {
            this.timerRunning = false;
            this.isPaused = false; // Clear pause state when stopping
            this.pauseStartTime = null;
            
            const finalTime = this.currentTime;
            
            // Check if this is a new best time
            if (this.bestTime === null || finalTime < this.bestTime) {
                this.bestTime = finalTime;
                this.saveBestTime(this.bestTime);
                this.updateBestTimeDisplay();
                this.showNewRecordAnimation();
            }
            
            return finalTime;
        }
        return null;
    }
    
    pause() {
        if (this.timerRunning && !this.isPaused) {
            this.isPaused = true;
            this.pauseStartTime = performance.now();
        }
    }
    
    resume() {
        if (this.timerRunning && this.isPaused) {
            this.isPaused = false;
            if (this.pauseStartTime !== null) {
                this.pausedTime += performance.now() - this.pauseStartTime;
                this.pauseStartTime = null;
            }
        }
    }
    
    setPaused(paused) {
        if (paused) {
            this.pause();
        } else {
            this.resume();
        }
    }
    
    update() {
        if (this.timerRunning && this.startTime !== null && !this.isPaused) {
            const currentPausedTime = this.pauseStartTime !== null ? 
                this.pausedTime + (performance.now() - this.pauseStartTime) : 
                this.pausedTime;
            
            this.currentTime = (performance.now() - this.startTime - currentPausedTime) / 1000; // Convert to seconds
            this.updateTimerDisplay();
        }
    }
    
    updateTimerDisplay() {
        const timeToDisplay = this.timerRunning ? this.currentTime : 0;
        const minutes = Math.floor(timeToDisplay / 60);
        const seconds = Math.floor(timeToDisplay % 60);
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update desktop timer
        const timerElement = document.getElementById('timer-display');
        if (timerElement) {
            timerElement.textContent = formattedTime;
            
            // Add visual indication when paused
            if (this.isPaused && this.timerRunning) {
                timerElement.style.opacity = '0.6';
                timerElement.style.color = '#ffaa00';
            } else {
                timerElement.style.opacity = '1';
                timerElement.style.color = '';
            }
        }
        
        // Update mobile timer
        const mobileTimerElement = document.getElementById('mobile-timer-display');
        if (mobileTimerElement) {
            mobileTimerElement.textContent = formattedTime;
            
            // Add visual indication when paused
            if (this.isPaused && this.timerRunning) {
                mobileTimerElement.style.opacity = '0.6';
                mobileTimerElement.style.color = '#ffaa00';
            } else {
                mobileTimerElement.style.opacity = '1';
                mobileTimerElement.style.color = '';
            }
        }
    }
    
    updateBestTimeDisplay() {
        const bestTimeText = this.bestTime !== null ? 
            `Best: ${this.formatTime(this.bestTime)}` : 
            'Best: --:--';
        
        // Update desktop best time
        const bestTimeElement = document.getElementById('best-time');
        if (bestTimeElement) {
            bestTimeElement.textContent = bestTimeText;
        }
        
        // Update mobile best time
        const mobileBestTimeElement = document.getElementById('mobile-best-time');
        if (mobileBestTimeElement) {
            mobileBestTimeElement.textContent = bestTimeText;
        }
    }
    
    showNewRecordAnimation() {
        // Animate desktop element
        const bestTimeElement = document.getElementById('best-time');
        if (bestTimeElement) {
            bestTimeElement.classList.add('new-record');
            setTimeout(() => {
                bestTimeElement.classList.remove('new-record');
            }, 3000);
        }
        
        // Animate mobile element
        const mobileBestTimeElement = document.getElementById('mobile-best-time');
        if (mobileBestTimeElement) {
            mobileBestTimeElement.classList.add('new-record');
            setTimeout(() => {
                mobileBestTimeElement.classList.remove('new-record');
            }, 3000);
        }
    }
    
    loadBestTime() {
        try {
            const saved = localStorage.getItem('sheepdog-best-time');
            return saved ? parseFloat(saved) : null;
        } catch (error) {
            console.warn('Could not load best time from localStorage:', error);
            return null;
        }
    }
    
    saveBestTime(time) {
        try {
            localStorage.setItem('sheepdog-best-time', time.toString());
        } catch (error) {
            console.warn('Could not save best time to localStorage:', error);
        }
    }
    
    formatTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    getCurrentTime() {
        return this.currentTime;
    }
    
    getBestTime() {
        return this.bestTime;
    }
    
    isRunning() {
        return this.timerRunning;
    }
    
    isPausedState() {
        return this.isPaused;
    }
    
    reset() {
        this.startTime = null;
        this.currentTime = 0;
        this.timerRunning = false;
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = null;
        this.updateTimerDisplay();
    }
} 