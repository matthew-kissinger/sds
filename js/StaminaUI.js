/**
 * StaminaUI class - DEPRECATED - Legacy DOM-based stamina UI
 * 
 * This class has been replaced by React-based stamina components.
 * It's kept for backward compatibility but all functionality has been moved to React.
 * 
 * Migration: Stamina display is now handled by React components in the src/ directory.
 */
export class StaminaUI {
    constructor() {
        console.log('⚠️ StaminaUI: This class is deprecated. Stamina UI now handled by React components.');
        
        // Mark as using React UI to skip all legacy DOM operations
        this.usingReactUI = true;
        
        // Preserve API for backward compatibility
        this.previousPercentage = 100;
        this.previousState = 'normal';
    }
    
    /**
     * @deprecated Stamina updates now handled by React components
     */
    update(staminaInfo) {
        // No-op: React components handle stamina display
        return;
    }
    
    /**
     * @deprecated Show/hide functionality now handled by React components
     */
    show() {
        // No-op: React components handle visibility
        return;
    }
    
    /**
     * @deprecated Show/hide functionality now handled by React components
     */
    hide() {
        // No-op: React components handle visibility
        return;
    }
    
    /**
     * @deprecated Reset functionality now handled by React components
     */
    reset() {
        // Reset state for backward compatibility
        this.previousPercentage = 100;
        this.previousState = 'normal';
        return;
    }
}
