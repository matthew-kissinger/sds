// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import {
  SHEEP_BREEDS,
  getSheepBreed,
  type FlockVarietyId,
} from '@app/scene/flock/sheepVariety';
import {
  getSheepName,
  getRandomSheepName,
} from '@app/game/sheepNames';

interface SheepInspectorCardProps {
  readonly selectedSheep: number;
  readonly flockVarietyMode: FlockVarietyId;
  readonly customSheepNames: Readonly<Record<number, string>>;
  readonly setSheepName: (index: number, name: string) => void;
  readonly onPrevSheep: () => void;
  readonly onNextSheep: () => void;
}

export function SheepInspectorCard({
  selectedSheep,
  flockVarietyMode,
  customSheepNames,
  setSheepName,
  onPrevSheep,
  onNextSheep,
}: SheepInspectorCardProps) {
  const currentBreedId = getSheepBreed(selectedSheep, flockVarietyMode);
  const currentBreed = SHEEP_BREEDS[currentBreedId];
  const currentName = getSheepName(selectedSheep, customSheepNames);
  const isCustomized = Boolean(customSheepNames[selectedSheep]?.trim());

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onNextSheep();
    }
  };

  return (
    <div className="herd-sheep-hero-card">
      <div className="herd-sheep-hero-header">
        <div className="herd-sheep-stepper">
          <button
            type="button"
            className="herd-stepper-btn"
            onClick={onPrevSheep}
            title="Inspect previous sheep"
            aria-label="Previous sheep"
          >
            ‹
          </button>
          <span className="herd-sheep-num">Sheep #{selectedSheep + 1}</span>
          <button
            type="button"
            className="herd-stepper-btn"
            onClick={onNextSheep}
            title="Inspect next sheep"
            aria-label="Next sheep"
          >
            ›
          </button>
        </div>

        <div className="herd-breed-badge" title={`${currentBreed.name} — ${currentBreed.fleeceDescription}`}>
          <span
            className="herd-mini-swatch"
            style={{ backgroundColor: currentBreed.swatchFace }}
          />
          <span className="herd-breed-badge-text">{currentBreed.name}</span>
        </div>
      </div>

      <div className="herd-rename-row">
        <input
          type="text"
          className="herd-rename-input"
          maxLength={24}
          value={currentName}
          placeholder="Name this sheep..."
          aria-label={`Name for sheep #${selectedSheep + 1}`}
          onChange={(e) => setSheepName(selectedSheep, e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="herd-action-btn"
          title="Pick a random pastoral name"
          onClick={() => setSheepName(selectedSheep, getRandomSheepName())}
        >
          Roll
        </button>
        {isCustomized ? (
          <button
            type="button"
            className="herd-action-btn herd-action-btn--reset"
            title="Reset to default name"
            onClick={() => setSheepName(selectedSheep, '')}
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="herd-breed-subtext">
        <span className="herd-breed-origin-text">{currentBreed.origin}</span>
        <span className="herd-dot-sep">·</span>
        <span className="herd-breed-desc-text">{currentBreed.description}</span>
      </div>
    </div>
  );
}
