import React from 'react';
import './MobileHUD.css';
import MobileJoystick from './MobileJoystick.jsx';
import MobileZoomControl from './MobileZoomControl.jsx';

const MobileHUD = ({ gameData }) => {
  // Format time without decimals - game standard
  const formatGameTime = (seconds) => {
    // Ensure seconds is a number and remove any decimals
    const cleanSeconds = Math.floor(Number(seconds) || 0);
    const mins = Math.floor(cleanSeconds / 60);
    const secs = cleanSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate stamina percentage safely
  const staminaPercentage = Math.max(0, Math.min(100, gameData.staminaPercentage || gameData.stamina || 100));
  
  // Determine stamina color based on level
  const getStaminaColor = (stamina) => {
    if (stamina > 60) return '#4ade80'; // Green
    if (stamina > 30) return '#fbbf24'; // Yellow  
    return '#ef4444'; // Red
  };

  // Debug: Log component data
  console.log('MobileHUD render:', { 
    gameTime: gameData.gameTime, 
    sheepCount: gameData.sheepCount, 
    stamina: staminaPercentage 
  });

  return (
    <div className="mobile-hud-container">
      {/* Top Status Bar - Always Visible Game Standard */}
      <div className="mobile-status-bar glass-panel">
        <div className="status-item">
          <span className="sheep-icon">🐑</span>
          <span className="sheep-count">{gameData.sheepCount || 0}/{gameData.totalSheep || 200}</span>
        </div>
        
        <div className="status-item">
          <span className="timer-icon">⏱️</span>
          <span className="timer">{formatGameTime(gameData.gameTime || 0)}</span>
        </div>
        
        <div className="status-item">
          <span className="stamina-icon">⚡</span>
          <div className="stamina-bar">
            <div 
              className="stamina-fill" 
              style={{ 
                width: `${staminaPercentage}%`,
                backgroundColor: getStaminaColor(staminaPercentage)
              }}
            />
          </div>
        </div>
      </div>

      {/* Sprint button - positioned separately */}
      <button 
        className="sprint-button glass-panel"
        onTouchStart={(e) => {
          e.preventDefault();
          // Hook into existing sprint system
          if (window.gameInstance?.mobileControls) {
            window.gameInstance.mobileControls.isSprinting = true;
          }
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          if (window.gameInstance?.mobileControls) {
            window.gameInstance.mobileControls.isSprinting = false;
          }
        }}
      >
        <span className="sprint-icon">🏃</span>
      </button>
      
      {/* New zoom control component */}
      <MobileZoomControl />

      {/* Joystick - Left thumb zone */}
      <MobileJoystick />
    </div>
  );
};

export default MobileHUD; 