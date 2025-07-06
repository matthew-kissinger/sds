import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('react-root');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});

// Create React root element if it doesn't exist
if (!document.getElementById('react-root')) {
  const reactRoot = document.createElement('div');
  reactRoot.id = 'react-root';
  reactRoot.style.cssText = 'position: absolute; inset: 0; pointer-events: none; z-index: 1000;';
  document.body.appendChild(reactRoot);
  
  const root = ReactDOM.createRoot(reactRoot);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}