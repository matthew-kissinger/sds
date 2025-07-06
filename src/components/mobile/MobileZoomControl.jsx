import React, { useState, useEffect, useRef } from 'react';
import './MobileZoomControl.css';

const MobileZoomControl = () => {
  const [zoomLevel, setZoomLevel] = useState(80);
  const [isZooming, setIsZooming] = useState(null);
  const zoomIntervalRef = useRef(null);
  
  // Sync with game's zoom level on mount
  useEffect(() => {
    // Get initial zoom from game if available
    if (window.gameInstance?.sceneManager?.cameraDistance) {
      setZoomLevel(window.gameInstance.sceneManager.cameraDistance);
    }
  }, []);
  
  // Smooth continuous zoom while holding button
  const startZoom = (direction) => {
    setIsZooming(direction);
    
    // Immediate feedback
    handleZoomChange(direction === 'in' ? -5 : 5);
    
    // Continue zooming while held
    zoomIntervalRef.current = setInterval(() => {
      handleZoomChange(direction === 'in' ? -3 : 3);
    }, 50);
  };
  
  const stopZoom = () => {
    setIsZooming(null);
    if (zoomIntervalRef.current) {
      clearInterval(zoomIntervalRef.current);
      zoomIntervalRef.current = null;
    }
  };
  
  const handleZoomChange = (delta) => {
    setZoomLevel(prevZoom => {
      const newZoom = Math.max(20, Math.min(150, prevZoom + delta));
      
      // Update game camera
      if (window.gameInstance?.mobileControls?.onZoomChange) {
        window.gameInstance.mobileControls.onZoomChange(newZoom);
      }
      
      return newZoom;
    });
  };
  
  // Calculate zoom percentage for visual feedback
  const zoomPercentage = ((150 - zoomLevel) / (150 - 20)) * 100;
  
  // Format zoom display
  const getZoomDisplay = () => {
    if (zoomLevel <= 30) return { text: 'Close', emoji: '🔍' };
    if (zoomLevel <= 60) return { text: 'Near', emoji: '👁️' };
    if (zoomLevel <= 100) return { text: 'Normal', emoji: '📷' };
    if (zoomLevel <= 130) return { text: 'Far', emoji: '🔭' };
    return { text: 'Eagle', emoji: '🦅' };
  };
  
  const zoomDisplay = getZoomDisplay();
  
  return (
    <div className="mobile-zoom-control">
      {/* Zoom indicator bar */}
      <div className="zoom-indicator">
        <div 
          className="zoom-indicator-fill"
          style={{ height: `${zoomPercentage}%` }}
        />
        <div className="zoom-indicator-notches">
          {[0, 25, 50, 75, 100].map(percent => (
            <div 
              key={percent} 
              className="zoom-notch"
              style={{ bottom: `${percent}%` }}
            />
          ))}
        </div>
      </div>
      
      {/* Current zoom display */}
      <div className="zoom-display">
        <span className="zoom-emoji">{zoomDisplay.emoji}</span>
        <span className="zoom-text">{zoomDisplay.text}</span>
      </div>
      
      {/* Zoom buttons */}
      <button
        className={`zoom-button zoom-in ${isZooming === 'in' ? 'active' : ''}`}
        onTouchStart={(e) => {
          e.preventDefault();
          startZoom('in');
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          stopZoom();
        }}
        onMouseDown={() => startZoom('in')}
        onMouseUp={stopZoom}
        onMouseLeave={stopZoom}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      
      <button
        className={`zoom-button zoom-out ${isZooming === 'out' ? 'active' : ''}`}
        onTouchStart={(e) => {
          e.preventDefault();
          startZoom('out');
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          stopZoom();
        }}
        onMouseDown={() => startZoom('out')}
        onMouseUp={stopZoom}
        onMouseLeave={stopZoom}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
};

export default MobileZoomControl; 