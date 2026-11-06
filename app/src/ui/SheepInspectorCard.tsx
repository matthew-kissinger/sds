// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import {
  SHEEP_BREEDS,
  getSheepBreed,
  type FlockVarietyId,
} from '@app/scene/flock/sheepVariety';
import { useT } from '@app/i18n/store';
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
  const t = useT();
  const currentBreedId = getSheepBreed(selectedSheep, flockVarietyMode);
  const currentBreed = SHEEP_BREEDS[currentBreedId];
  const breedName = t(`breed.${currentBreedId}.name`);
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
            title={t('sheep.prevTitle')}
            aria-label={t('sheep.prev')}
          >
            ‹
          </button>
          <span className="herd-sheep-num">{t('sheep.number', { number: selectedSheep + 1 })}</span>
          <button
            type="button"
            className="herd-stepper-btn"
            onClick={onNextSheep}
            title={t('sheep.nextTitle')}
            aria-label={t('sheep.next')}
          >
            ›
          </button>
        </div>

        <div className="herd-breed-badge" title={`${breedName} — ${t(`breed.${currentBreedId}.fleece`)}`}>
          <span
            className="herd-mini-swatch"
            style={{ backgroundColor: currentBreed.swatchFace }}
          />
          <span className="herd-breed-badge-text">{breedName}</span>
        </div>
      </div>

      <div className="herd-rename-row">
        <input
          type="text"
          className="herd-rename-input"
          maxLength={24}
          value={currentName}
          placeholder={t('sheep.namePlaceholder')}
          aria-label={t('sheep.nameLabel', { number: selectedSheep + 1 })}
          onChange={(e) => setSheepName(selectedSheep, e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="herd-action-btn"
          title={t('sheep.rollTitle')}
          onClick={() => setSheepName(selectedSheep, getRandomSheepName())}
        >
          {t('studio.roll')}
        </button>
        {isCustomized ? (
          <button
            type="button"
            className="herd-action-btn herd-action-btn--reset"
            title={t('sheep.resetTitle')}
            onClick={() => setSheepName(selectedSheep, '')}
          >
            {t('sheep.reset')}
          </button>
        ) : null}
      </div>

      <div className="herd-breed-subtext">
        <span className="herd-breed-origin-text">{t(`breed.${currentBreedId}.origin`)}</span>
        <span className="herd-dot-sep">·</span>
        <span className="herd-breed-desc-text">{t(`breed.${currentBreedId}.description`)}</span>
      </div>
    </div>
  );
}
