/**
 * StaminaUI class - manages the stamina bar display
 */
export class StaminaUI {
    constructor() {
        this.staminaFill = document.getElementById('stamina-fill');
        this.staminaText = document.getElementById('stamina-text');
        this.staminaLabel = document.getElementById('stamina-label');
        
        // Cache DOM elements for performance
        this.elements = {
            fill: this.staminaFill,
            text: this.staminaText,
            label: this.staminaLabel
        };
        
        // Track previous state to avoid unnecessary updates
        this.previousPercentage = 100;
        this.previousState = 'normal';
    }
    
    /**
     * Update the stamina bar based on sheepdog stamina info
     * @param {Object} staminaInfo - Object containing stamina data from sheepdog
     */
    update(staminaInfo) {
        const { percentage, isSprinting, canSprint } = staminaInfo;
        const roundedPercentage = Math.round(percentage);
        
        // Only update if percentage changed to avoid unnecessary DOM manipulation
        if (roundedPercentage !== this.previousPercentage) {
            this.elements.fill.style.width = `${percentage}%`;
            this.elements.text.textContent = `${roundedPercentage}%`;
            this.previousPercentage = roundedPercentage;
        }
        
        // Determine current state for styling
        let currentState = 'normal';
        if (isSprinting) {
            currentState = 'sprinting';
        } else if (percentage <= 10) {
            currentState = 'critical';
        } else if (percentage <= 30) {
            currentState = 'low';
        }
        
        // Update styling only if state changed
        if (currentState !== this.previousState) {
            // Remove all state classes
            this.elements.fill.classList.remove('low', 'critical', 'sprinting');
            
            // Add current state class
            if (currentState !== 'normal') {
                this.elements.fill.classList.add(currentState);
            }
            
            // Update label based on state
            if (isSprinting) {
                this.elements.label.textContent = 'Sprinting!';
                this.elements.label.style.color = '#2196F3';
            } else if (!canSprint) {
                this.elements.label.textContent = 'Stamina (Exhausted)';
                this.elements.label.style.color = '#F44336';
            } else {
                this.elements.label.textContent = 'Stamina';
                this.elements.label.style.color = '#333';
            }
            
            this.previousState = currentState;
        }
    }
    
    /**
     * Show the stamina bar (called when game starts)
     */
    show() {
        const staminaBar = document.getElementById('stamina-bar');
        if (staminaBar) {
            staminaBar.classList.add('visible');
        }
    }
    
    /**
     * Hide the stamina bar (called when game ends or on start screen)
     */
    hide() {
        const staminaBar = document.getElementById('stamina-bar');
        if (staminaBar) {
            staminaBar.classList.remove('visible');
        }
    }
    
    /**
     * Reset stamina bar to full
     */
    reset() {
        this.elements.fill.style.width = '100%';
        this.elements.text.textContent = '100%';
        this.elements.label.textContent = 'Stamina';
        this.elements.label.style.color = '#333';
        this.elements.fill.classList.remove('low', 'critical', 'sprinting');
        this.previousPercentage = 100;
        this.previousState = 'normal';
    }
} 