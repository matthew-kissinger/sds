// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useMemo, useRef, useState, useEffect } from 'react';
import { useGameStore, type FlockSize } from '@app/state/store';
import {
  SHEEP_BREEDS,
  getSheepBreed,
  type SheepBreedId,
} from '@app/scene/flock/sheepVariety';
import {
  getSheepName,
  getRandomSheepName,
  SHEEP_NAMES_LEDGER,
} from '@app/game/sheepNames';
import { SheepInspectorCard } from './SheepInspectorCard';

const FLOCK_SIZES: readonly FlockSize[] = [25, 75, 200];
const BREED_IDS: readonly SheepBreedId[] = [
  'suffolk',
  'cheviot',
  'herdwick',
  'kerry_hill',
  'badger_face',
  'moorit',
  'balwen',
  'jacob',
  'black',
];

export function SheepRegistryTab() {
  const flockSize = useGameStore((state) => state.flockSize);
  const setFlockSize = useGameStore((state) => state.setFlockSize);
  const flockVarietyMode = useGameStore((state) => state.flockVarietyMode);
  const customSheepNames = useGameStore((state) => state.customSheepNames);
  const setSheepName = useGameStore((state) => state.setSheepName);
  const setBatchSheepNames = useGameStore((state) => state.setBatchSheepNames);
  const resetSheepNames = useGameStore((state) => state.resetSheepNames);
  const selectedSheep = useGameStore((state) => state.customizeSelectedSheep);
  const setSelectedSheep = useGameStore((state) => state.setCustomizeSelectedSheep);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBreed, setFilterBreed] = useState<'all' | SheepBreedId | 'custom'>('all');
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  // Count custom-named sheep
  const customCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < flockSize; i++) {
      if (customSheepNames[i]?.trim()) count++;
    }
    return count;
  }, [flockSize, customSheepNames]);

  // Breed counts in current flock
  const breedCounts = useMemo(() => {
    const counts = {} as Record<SheepBreedId, number>;
    for (const id of BREED_IDS) counts[id] = 0;
    for (let i = 0; i < flockSize; i++) {
      counts[getSheepBreed(i, flockVarietyMode)]++;
    }
    return counts;
  }, [flockSize, flockVarietyMode]);

  // Filtered sheep indices
  const filteredIndices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result: number[] = [];

    for (let i = 0; i < flockSize; i++) {
      const breed = getSheepBreed(i, flockVarietyMode);
      if (filterBreed === 'custom' && !customSheepNames[i]?.trim()) continue;
      if (filterBreed !== 'all' && filterBreed !== 'custom' && breed !== filterBreed) continue;

      if (query) {
        const numStr = (i + 1).toString();
        const name = getSheepName(i, customSheepNames).toLowerCase();
        const breedName = SHEEP_BREEDS[breed].name.toLowerCase();
        if (!numStr.includes(query) && !name.includes(query) && !breedName.includes(query)) {
          continue;
        }
      }

      result.push(i);
    }
    return result;
  }, [flockSize, flockVarietyMode, filterBreed, searchQuery, customSheepNames]);

  // Scroll only the chip grid, never the outer editor: opening the registry
  // must leave the naming form visible rather than jump past it to the list.
  useEffect(() => {
    const chip = activeChipRef.current;
    const grid = chip?.parentElement;
    if (!chip || !grid) return;
    const item = chip.getBoundingClientRect(), bounds = grid.getBoundingClientRect();
    if (item.top < bounds.top) grid.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) grid.scrollTop += item.bottom - bounds.bottom;
  }, [selectedSheep]);

  const handlePrevSheep = () => {
    const currentIdxInFiltered = filteredIndices.indexOf(selectedSheep);
    if (currentIdxInFiltered > 0) {
      const prev = filteredIndices[currentIdxInFiltered - 1];
      if (prev !== undefined) setSelectedSheep(prev);
    } else if (filteredIndices.length > 0) {
      const last = filteredIndices[filteredIndices.length - 1];
      if (last !== undefined) setSelectedSheep(last);
    } else if (selectedSheep > 0) {
      setSelectedSheep(selectedSheep - 1);
    }
  };

  const handleNextSheep = () => {
    const currentIdxInFiltered = filteredIndices.indexOf(selectedSheep);
    if (currentIdxInFiltered >= 0 && filteredIndices.length > 1) {
      const next = filteredIndices[(currentIdxInFiltered + 1) % filteredIndices.length];
      if (next !== undefined) setSelectedSheep(next);
    } else if (selectedSheep < flockSize - 1) {
      setSelectedSheep(selectedSheep + 1);
    }
  };

  const handleBatchRandomizeRemaining = () => {
    const batch: Record<number, string> = {};
    const usedNames = new Set<string>();
    for (let i = 0; i < flockSize; i++) {
      const existing = customSheepNames[i]?.trim();
      if (existing) usedNames.add(existing.toLowerCase());
    }

    const availablePool = SHEEP_NAMES_LEDGER.filter(
      (n) => !usedNames.has(n.toLowerCase()),
    );
    let poolIdx = 0;

    for (let i = 0; i < flockSize; i++) {
      if (!customSheepNames[i]?.trim()) {
        const assignedName =
          poolIdx < availablePool.length
            ? availablePool[poolIdx++]!
            : getRandomSheepName();
        batch[i] = assignedName;
      }
    }

    setBatchSheepNames(batch);
  };

  // Batch pages for 75 / 200 flock sizes
  const batchPages = useMemo(() => {
    if (flockSize <= 25) return [];
    const pages: { label: string; startIndex: number }[] = [];
    const pageSize = 25;
    for (let start = 0; start < flockSize; start += pageSize) {
      const end = Math.min(start + pageSize, flockSize);
      pages.push({ label: `${start + 1}–${end}`, startIndex: start });
    }
    return pages;
  }, [flockSize]);

  return (
    <div className="herd-tab-content">
      <div className="herd-sheep-editor">
        <SheepInspectorCard
          selectedSheep={selectedSheep}
          flockVarietyMode={flockVarietyMode}
          customSheepNames={customSheepNames}
          setSheepName={setSheepName}
          onPrevSheep={handlePrevSheep}
          onNextSheep={handleNextSheep}
        />

        <div className="herd-flock-scope" role="group" aria-label="Flock size selection">
          <span className="herd-scope-label">Flock size:</span>
          {FLOCK_SIZES.map((size) => (
            <button key={size} type="button" aria-label={`${size} sheep`}
              className={`herd-scope-btn ${flockSize === size ? 'herd-scope-btn--active' : ''}`}
              onClick={() => setFlockSize(size)}>{size}</button>
          ))}
        </div>

        {/* Unified Search and Breed Filter Bar */}
        <div className="herd-filter-bar">
          <input
            type="search"
            className="herd-search-field"
            placeholder="Search name, breed, or #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter sheep by text"
          />
          <select
            className="herd-breed-dropdown"
            value={filterBreed}
            onChange={(e) =>
              setFilterBreed(e.target.value as 'all' | SheepBreedId | 'custom')
            }
            aria-label="Filter by breed"
          >
            <option value="all">All breeds ({flockSize})</option>
            {customCount > 0 ? (
              <option value="custom">Named only ({customCount})</option>
            ) : null}
            {BREED_IDS.map((id) =>
              breedCounts[id] > 0 ? (
                <option key={id} value={id}>
                  {SHEEP_BREEDS[id].name} ({breedCounts[id]})
                </option>
              ) : null,
            )}
          </select>
        </div>

        {/* Batch Pages for 75/200 sizes */}
        {batchPages.length > 0 && filterBreed === 'all' && !searchQuery ? (
          <div className="herd-batch-pages" role="navigation" aria-label="Sheep batches">
            {batchPages.map((page) => {
              const isActive =
                selectedSheep >= page.startIndex &&
                selectedSheep < page.startIndex + 25;
              return (
                <button
                  key={page.startIndex}
                  type="button"
                  className={`herd-page-btn ${isActive ? 'herd-page-btn--active' : ''}`}
                  onClick={() => setSelectedSheep(page.startIndex)}
                >
                  {page.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Summary & Batch Actions */}
        <div className="herd-registry-status">
          <span className="herd-status-count">
            {filteredIndices.length === flockSize
              ? `${flockSize} sheep`
              : `${filteredIndices.length} of ${flockSize} sheep`}
          </span>
          <div className="herd-status-actions">
            {customCount < flockSize ? (
              <button
                type="button"
                className="herd-link-btn"
                onClick={handleBatchRandomizeRemaining}
                title="Fill all remaining unnamed sheep with names from the ledger"
              >
                Name remaining
              </button>
            ) : null}
            {customCount > 0 ? (
              <button
                type="button"
                className="herd-link-btn herd-link-btn--reset"
                onClick={resetSheepNames}
                title="Reset all custom names"
              >
                Reset names
              </button>
            ) : null}
          </div>
        </div>

        {/* Sized Sheep Grid */}
        <div className="herd-sheep-grid" role="listbox" aria-label="Filtered flock sheep list">
          {filteredIndices.length === 0 ? (
            <p className="herd-empty-hint">No sheep match current filter</p>
          ) : (
            filteredIndices.map((i) => {
              const breed = SHEEP_BREEDS[getSheepBreed(i, flockVarietyMode)];
              const hasCustom = Boolean(customSheepNames[i]?.trim());
              const isCur = selectedSheep === i;
              const sheepName = getSheepName(i, customSheepNames);
              return (
                <button
                  key={i}
                  ref={isCur ? activeChipRef : null}
                  type="button"
                  role="option"
                  aria-selected={isCur}
                  title={`#${i + 1}: ${sheepName} (${breed.name})`}
                  className={`herd-sheep-chip ${isCur ? 'herd-sheep-chip--active' : ''} ${
                    hasCustom ? 'herd-sheep-chip--custom' : ''
                  }`}
                  onClick={() => setSelectedSheep(i)}
                >
                  <span
                    className="herd-chip-dot"
                    style={{ backgroundColor: breed.swatchFace }}
                  />
                  <span>{i + 1}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
