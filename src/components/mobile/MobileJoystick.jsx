import React, { useEffect, useRef } from 'react';
import './MobileJoystick.css';

const MobileJoystick = () => {
  const containerRef = useRef(null);
  const joystickRef = useRef(null);

  useEffect(() => {
    // Load nipple.js if not already loaded
    const loadNippleJS = async () => {
      if (window.nipplejs) {
        initializeJoystick();
        return;
      }

      try {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.10.2/nipplejs.js';
        script.onload = () => initializeJoystick();
        document.head.appendChild(script);
      } catch (error) {
        console.error('Failed to load nipple.js:', error);
      }
    };

    const initializeJoystick = () => {
      if (!containerRef.current || !window.nipplejs) return;

      // Create joystick
      joystickRef.current = window.nipplejs.create({
        zone: containerRef.current,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#00BFFF',
        size: 120,
        threshold: 0.1,
        fadeTime: 250,
        restOpacity: 0.7
      });

      // Handle joystick events
      joystickRef.current.on('start', () => {
        if (window.gameInstance?.mobileControls) {
          window.gameInstance.mobileControls.isMoving = true;
        }
        containerRef.current?.classList.add('active');
      });

      joystickRef.current.on('move', (evt, data) => {
                 if (data.vector && window.gameInstance?.mobileControls) {
           // Direct coordinate mapping for intuitive controls
           const gameCoords = {
             x: data.vector.x,      // Left/Right: Direct mapping
             z: -data.vector.y      // Forward/Back: Up = forward (reversed)
           };
          
          window.gameInstance.mobileControls.movementVector.x = gameCoords.x;
          window.gameInstance.mobileControls.movementVector.z = gameCoords.z;
          window.gameInstance.mobileControls.isMoving = true;
        }
      });

      joystickRef.current.on('end', () => {
        if (window.gameInstance?.mobileControls) {
          window.gameInstance.mobileControls.movementVector.x = 0;
          window.gameInstance.mobileControls.movementVector.z = 0;
          window.gameInstance.mobileControls.isMoving = false;
        }
        containerRef.current?.classList.remove('active');
      });
    };

    loadNippleJS();

    // Cleanup
    return () => {
      if (joystickRef.current) {
        joystickRef.current.destroy();
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="mobile-joystick-container glass-panel"
    />
  );
};

export default MobileJoystick; 