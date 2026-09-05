// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useRef, useState } from 'react';
import { useStudioLayout } from './useStudioLayout';
import { useGameStore } from '@app/state/store';
import {
  DOG_COAT_PRESETS,
  getRandomDogName,
  type DogCoatId,
} from '@app/scene/dog/dogCustomization';
import {
  FLOCK_VARIETY_OPTIONS,
  type FlockVarietyId,
} from '@app/scene/flock/sheepVariety';
import { getSheepName } from '@app/game/sheepNames';
import { SheepRegistryTab } from './SheepRegistryTab';

const DOG_ANGLES = [
  { id: 'hero', label: '3/4 Hero' },
  { id: 'face', label: 'Face' },
  { id: 'profile', label: 'Profile' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'top', label: 'Top' },
] as const;

export function CustomizePanel() {
  const dogCoatPreset = useGameStore((state) => state.dogCoatPreset);
  const setDogCoatPreset = useGameStore((state) => state.setDogCoatPreset);
  const dogName = useGameStore((state) => state.dogName);
  const setDogName = useGameStore((state) => state.setDogName);
  const flockVarietyMode = useGameStore((state) => state.flockVarietyMode);
  const setFlockVarietyMode = useGameStore((state) => state.setFlockVarietyMode);
  const customSheepNames = useGameStore((state) => state.customSheepNames);
  const closeCustomize = useGameStore((state) => state.closeCustomize);
  const flockSize = useGameStore((state) => state.flockSize);

  const activeTab = useGameStore((state) => state.customizeTab);
  const setActiveTab = useGameStore((state) => state.setCustomizeTab);
  const dogAngle = useGameStore((state) => state.customizeDogAngle);
  const setDogAngle = useGameStore((state) => state.setCustomizeDogAngle);
  const selectedSheep = useGameStore((state) => state.customizeSelectedSheep);
  const setSelectedSheep = useGameStore((state) => state.setCustomizeSelectedSheep);
  const setOrbitAngle = useGameStore((state) => state.setCustomizeOrbitAngle);

  const { layout, style: layoutStyle } = useStudioLayout();
  const studioRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    studioRef.current?.querySelector<HTMLElement>('[aria-label="Close customization studio"]')?.focus();
    return () => { window.requestAnimationFrame(() => {
      const target = previous?.isConnected && previous !== document.body
        ? previous : document.getElementById('customize-trigger');
      target?.focus();
    }); };
  }, []);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);

  const currentName = getSheepName(selectedSheep, customSheepNames);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartX.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX.current;
    dragStartX.current = e.clientX;
    setOrbitAngle((prev) => prev - deltaX * 0.007);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
  };

  const handlePrevSheep = () => {
    setSelectedSheep(selectedSheep > 0 ? selectedSheep - 1 : flockSize - 1);
  };

  const handleNextSheep = () => {
    setSelectedSheep(selectedSheep < flockSize - 1 ? selectedSheep + 1 : 0);
  };

  return (
    <div ref={studioRef} id="customization-studio" className="herd-studio" data-bottom={layout.bottom} style={layoutStyle}
      role="dialog" aria-modal="true" aria-labelledby="customize-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); closeCustomize(); }
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]')]
          .filter(node => !node.hasAttribute('disabled') && node.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      {/* 3D Viewport Interaction & Orbit Controls */}
      <div
        className={`herd-customize-drag-zone ${isDragging ? 'herd-customize-drag-zone--active' : ''}`}
        aria-label="Drag to orbit 3D camera preview"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Floating 3D Preview Status and Controls */}
      <div className="herd-customize-hud" role="toolbar" aria-label="3D Preview Controls">
        <div className="herd-customize-pill">
          <span>
            {activeTab === 'dog'
              ? dogName
              : activeTab === 'flock'
              ? 'Flock preview'
              : `#${selectedSheep + 1}: ${currentName}`}
          </span>
        </div>

        {activeTab === 'dog' ? (
          <>
          <select className="herd-angle-select" aria-label="Camera angle" value={dogAngle}
            onChange={(e) => setDogAngle(e.target.value as typeof dogAngle)}>
            {DOG_ANGLES.map(angle => <option key={angle.id} value={angle.id}>{angle.label}</option>)}
          </select>
          <div className="herd-angle-controls" role="group" aria-label="Camera angles">
            {DOG_ANGLES.map((angle) => (
              <button
                key={angle.id}
                type="button"
                className={`herd-angle-btn ${dogAngle === angle.id ? 'herd-angle-btn--active' : ''}`}
                onClick={() => setDogAngle(angle.id)}
              >
                {angle.label}
              </button>
            ))}
          </div>
          </>
        ) : null}

        {activeTab === 'sheep' ? (
          <div className="herd-orbit-controls">
            <button type="button" className="herd-orbit-btn" title="Previous Sheep" aria-label="Previous Sheep" onClick={handlePrevSheep}>‹</button>
            <button type="button" className="herd-orbit-btn" title="Next Sheep" aria-label="Next Sheep" onClick={handleNextSheep}>›</button>
          </div>
        ) : null}

        <div className="herd-orbit-controls">
          <button type="button" className="herd-orbit-btn" title="Orbit Camera Left" aria-label="Orbit Camera Left" onClick={() => setOrbitAngle((prev) => prev + Math.PI / 6)}>⟲</button>
          <button type="button" className="herd-orbit-btn" title="Orbit Camera Right" aria-label="Orbit Camera Right" onClick={() => setOrbitAngle((prev) => prev - Math.PI / 6)}>⟳</button>
        </div>
      </div>

      {/* Left-docked AAA Customization Sidebar */}
      <aside
        className="herd-customize-dock"
      >
        <header className="herd-panel__header">
          <h2 id="customize-title" className="herd-panel__title">Studio</h2>
          <button type="button" className="herd-icon-button" aria-label="Close customization studio" onClick={closeCustomize}>Close</button>
        </header>

        <div className="herd-tabs" role="tablist" aria-label="Customization categories">
          <button type="button" role="tab" aria-selected={activeTab === 'dog'} className={`herd-tab ${activeTab === 'dog' ? 'herd-tab--active' : ''}`} onClick={() => setActiveTab('dog')}>
            Sheepdog
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'flock'} className={`herd-tab ${activeTab === 'flock' ? 'herd-tab--active' : ''}`} onClick={() => setActiveTab('flock')}>
            Flock Breeds
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'sheep'} className={`herd-tab ${activeTab === 'sheep' ? 'herd-tab--active' : ''}`} onClick={() => setActiveTab('sheep')}>
            Sheep Registry
          </button>
        </div>

        <div className="herd-studio-body">
        {activeTab === 'dog' ? (
          <div className="herd-tab-content">
            <p className="herd-customize-desc">
              Name your working collie and select coat markings and coloration. Changes preview live in 3D.
            </p>

            <div className="herd-rename-row" style={{ marginBottom: 14 }}>
              <input
                type="text"
                className="herd-rename-input"
                maxLength={24}
                value={dogName}
                placeholder="Name your dog..."
                aria-label="Working sheepdog name"
                onChange={(e) => setDogName(e.target.value)}
              />
              <button
                type="button"
                className="herd-action-btn"
                onClick={() => setDogName(getRandomDogName())}
                title="Roll traditional working collie name"
              >
                Roll
              </button>
            </div>

            <div className="herd-preset-list" role="radiogroup" aria-label="Working collie coats">
              {Object.values(DOG_COAT_PRESETS).map((preset) => {
                const isSelected = dogCoatPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`herd-preset-card ${isSelected ? 'herd-preset-card--selected' : ''}`}
                    onClick={() => setDogCoatPreset(preset.id as DogCoatId)}
                  >
                    <span
                      className="herd-swatch-circle"
                      style={{ backgroundColor: preset.swatch }}
                      aria-hidden="true"
                    />
                    <div className="herd-preset-details">
                      <span className="herd-preset-name">{preset.name}</span>
                      <span className="herd-preset-info">{preset.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTab === 'flock' ? (
          <div className="herd-tab-content">
            <p className="herd-customize-desc">
              Choose the natural breed makeup of your flock. Breeds feature distinct wool and face markings.
            </p>
            <div className="herd-preset-list" role="radiogroup" aria-label="Flock breed varieties">
              {FLOCK_VARIETY_OPTIONS.map((option) => {
                const isSelected = flockVarietyMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`herd-preset-card ${isSelected ? 'herd-preset-card--selected' : ''}`}
                    onClick={() => setFlockVarietyMode(option.id as FlockVarietyId)}
                  >
                    <div className="herd-preset-details">
                      <span className="herd-preset-name">{option.name}</span>
                      <span className="herd-preset-info">{option.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTab === 'sheep' ? <SheepRegistryTab /> : null}
        </div>
      </aside>
    </div>
  );
}
