// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  DOG_COAT_PRESETS,
  DEFAULT_DOG_COAT,
  DEFAULT_DOG_NAME,
  WORKING_DOG_NAMES,
  getRandomDogName,
  type DogCoatId,
} from '@app/scene/dog/dogCustomization';
import {
  SHEEP_BREEDS,
  FLOCK_VARIETY_OPTIONS,
  DEFAULT_FLOCK_VARIETY,
  getSheepBreed,
  type FlockVarietyId,
  type SheepBreedId,
} from '@app/scene/flock/sheepVariety';
import {
  getDefaultSheepName,
  getSheepName,
  getRandomSheepName,
  SHEEP_NAMES_LEDGER,
} from '@app/game/sheepNames';
import { useGameStore } from '@app/state/store';

describe('dog coat customization', () => {
  it('defines 5 valid working collie coat presets', () => {
    const presetIds: DogCoatId[] = ['classic', 'red', 'merle', 'chocolate', 'golden'];
    expect(Object.keys(DOG_COAT_PRESETS)).toEqual(presetIds);
    expect(DEFAULT_DOG_COAT).toBe('classic');

    for (const id of presetIds) {
      const preset = DOG_COAT_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.shadow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.mid).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.lit).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.outline).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('allows selecting presets in the store', () => {
    useGameStore.getState().setDogCoatPreset('red');
    expect(useGameStore.getState().dogCoatPreset).toBe('red');

    useGameStore.getState().setDogCoatPreset('merle');
    expect(useGameStore.getState().dogCoatPreset).toBe('merle');

    // Reset to classic
    useGameStore.getState().setDogCoatPreset('classic');
    expect(useGameStore.getState().dogCoatPreset).toBe('classic');
  });

  it('supports custom dog naming and randomized working collie names', () => {
    expect(DEFAULT_DOG_NAME).toBe('Pip');
    expect(useGameStore.getState().dogName).toBe('Pip');
    expect(WORKING_DOG_NAMES.length).toBeGreaterThan(10);
    expect(WORKING_DOG_NAMES).toContain('Pip');
    expect(WORKING_DOG_NAMES).toContain('Moss');
    expect(WORKING_DOG_NAMES).toContain('Fly');

    const randomName = getRandomDogName();
    expect(WORKING_DOG_NAMES).toContain(randomName);

    useGameStore.getState().setDogName('Moss');
    expect(useGameStore.getState().dogName).toBe('Moss');

    // Trims whitespace
    useGameStore.getState().setDogName('   Fly   ');
    expect(useGameStore.getState().dogName).toBe('Fly');

    // Blank name falls back to default
    useGameStore.getState().setDogName('   ');
    expect(useGameStore.getState().dogName).toBe('Pip');

    // Restore default
    useGameStore.getState().setDogName('Pip');
    expect(useGameStore.getState().dogName).toBe('Pip');
  });
});

describe('sheep breed variety', () => {
  it('defines authentic pastoral breeds with swatches', () => {
    const breedIds: SheepBreedId[] = [
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
    expect(Object.keys(SHEEP_BREEDS)).toEqual(breedIds);

    for (const id of breedIds) {
      const breed = SHEEP_BREEDS[id];
      expect(breed.id).toBe(id);
      expect(breed.name.length).toBeGreaterThan(0);
      expect(breed.origin.length).toBeGreaterThan(0);
      expect(breed.swatchFleece).toMatch(/^#[0-9a-f]{6}$/i);
      expect(breed.swatchFace).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('defines 5 pastoral variety options with default heritage mix', () => {
    const modeIds: FlockVarietyId[] = ['heritage', 'classic', 'highland', 'marked', 'black'];
    expect(FLOCK_VARIETY_OPTIONS.map((o) => o.id)).toEqual(modeIds);
    expect(DEFAULT_FLOCK_VARIETY).toBe('heritage');
  });

  it('deterministically assigns breeds according to variety mode', () => {
    // Woolma (index 3) is a Jacob with authentic heritage traits
    expect(getDefaultSheepName(3)).toBe('Woolma');
    expect(getSheepBreed(3, 'heritage')).toBe('jacob');
    expect(SHEEP_BREEDS.jacob.name).toBe('Jacob');
    expect(SHEEP_BREEDS.jacob.swatchFleece).toBe('#d8c29d');

    // Classic mode is always Suffolk
    for (let i = 0; i < 50; i++) {
      expect(getSheepBreed(i, 'classic')).toBe('suffolk');
    }

    // Black mode is always Black Welsh Mountain
    for (let i = 0; i < 50; i++) {
      expect(getSheepBreed(i, 'black')).toBe('black');
    }

    // Highland mode includes herdwick, moorit, and black
    const highlandBreeds = new Set<SheepBreedId>();
    for (let i = 0; i < 100; i++) {
      const breed = getSheepBreed(i, 'highland');
      expect(['herdwick', 'moorit', 'black']).toContain(breed);
      highlandBreeds.add(breed);
    }
    expect(highlandBreeds.has('herdwick')).toBe(true);
    expect(highlandBreeds.has('moorit')).toBe(true);
    expect(highlandBreeds.has('black')).toBe(true);

    // Marked mode includes kerry_hill, badger_face, jacob, and balwen
    const markedBreeds = new Set<SheepBreedId>();
    for (let i = 0; i < 100; i++) {
      const breed = getSheepBreed(i, 'marked');
      expect(['kerry_hill', 'badger_face', 'jacob', 'balwen']).toContain(breed);
      markedBreeds.add(breed);
    }
    expect(markedBreeds.has('kerry_hill')).toBe(true);
    expect(markedBreeds.has('badger_face')).toBe(true);
    expect(markedBreeds.has('jacob')).toBe(true);
    expect(markedBreeds.has('balwen')).toBe(true);

    // Heritage mode contains realistic pastoral diversity of all breeds
    const heritageBreeds = new Set<SheepBreedId>();
    for (let i = 0; i < 200; i++) {
      heritageBreeds.add(getSheepBreed(i, 'heritage'));
    }
    expect(heritageBreeds.has('suffolk')).toBe(true);
    expect(heritageBreeds.has('cheviot')).toBe(true);
    expect(heritageBreeds.has('herdwick')).toBe(true);
    expect(heritageBreeds.has('kerry_hill')).toBe(true);
    expect(heritageBreeds.has('badger_face')).toBe(true);
    expect(heritageBreeds.has('moorit')).toBe(true);
    expect(heritageBreeds.has('black')).toBe(true);

    // Consistency: same index + mode gives same breed every time
    expect(getSheepBreed(7, 'heritage')).toBe(getSheepBreed(7, 'heritage'));
  });

  it('updates flock variety mode in store', () => {
    useGameStore.getState().setFlockVarietyMode('highland');
    expect(useGameStore.getState().flockVarietyMode).toBe('highland');

    useGameStore.getState().setFlockVarietyMode('marked');
    expect(useGameStore.getState().flockVarietyMode).toBe('marked');

    useGameStore.getState().setFlockVarietyMode('heritage');
    expect(useGameStore.getState().flockVarietyMode).toBe('heritage');
  });
});

describe('custom sheep naming', () => {
  it('returns default ledger name when no custom name is present', () => {
    const name0 = getDefaultSheepName(0);
    expect(name0).toBe(SHEEP_NAMES_LEDGER[0]);
    expect(getSheepName(0, {})).toBe(name0);
  });

  it('uses custom name when provided and falls back if empty', () => {
    const customNames = { 0: 'Barnaby', 3: '  Wooliam  ', 5: '   ' };
    expect(getSheepName(0, customNames)).toBe('Barnaby');
    expect(getSheepName(3, customNames)).toBe('Wooliam');
    // Index 5 was empty string, should fall back to default
    expect(getSheepName(5, customNames)).toBe(getDefaultSheepName(5));
    // Index 1 has no custom name, should fall back to default
    expect(getSheepName(1, customNames)).toBe(getDefaultSheepName(1));
  });

  it('provides random authentic pastoral names', () => {
    const randomName = getRandomSheepName();
    expect(typeof randomName).toBe('string');
    expect(randomName.length).toBeGreaterThan(0);
    expect(SHEEP_NAMES_LEDGER).toContain(randomName);
  });

  it('updates custom sheep names in store and supports resetting', () => {
    useGameStore.getState().setSheepName(2, 'Daisy');
    expect(useGameStore.getState().customSheepNames[2]).toBe('Daisy');

    useGameStore.getState().setSheepName(2, '');
    expect(useGameStore.getState().customSheepNames[2]).toBeUndefined();

    useGameStore.getState().setSheepName(0, 'Pip');
    useGameStore.getState().setSheepName(1, 'Flora');
    expect(useGameStore.getState().customSheepNames[0]).toBe('Pip');
    expect(useGameStore.getState().customSheepNames[1]).toBe('Flora');

    useGameStore.getState().resetSheepNames();
    expect(Object.keys(useGameStore.getState().customSheepNames).length).toBe(0);
  });

  it('supports selecting and naming any sheep across the full 200-flock roster', () => {
    // Switch to 200 sheep
    useGameStore.getState().setFlockSize(200);
    expect(useGameStore.getState().flockSize).toBe(200);

    // Select high-index sheep
    useGameStore.getState().setCustomizeSelectedSheep(199);
    expect(useGameStore.getState().customizeSelectedSheep).toBe(199);

    // Name sheep #200 (index 199)
    useGameStore.getState().setSheepName(199, 'Bramble Champion');
    expect(getSheepName(199, useGameStore.getState().customSheepNames)).toBe('Bramble Champion');

    // Batch naming
    const batchNames: Record<number, string> = {
      0: 'Alpha',
      99: 'Century',
      198: 'Penultimate',
    };
    useGameStore.getState().setBatchSheepNames(batchNames);
    expect(useGameStore.getState().customSheepNames[0]).toBe('Alpha');
    expect(useGameStore.getState().customSheepNames[99]).toBe('Century');
    expect(useGameStore.getState().customSheepNames[198]).toBe('Penultimate');
    expect(useGameStore.getState().customSheepNames[199]).toBe('Bramble Champion');

    // Clamping on flock size reduction: 200 -> 25 clamps index 199 to 24
    useGameStore.getState().setFlockSize(25);
    expect(useGameStore.getState().flockSize).toBe(25);
    expect(useGameStore.getState().customizeSelectedSheep).toBe(24);

    // Clean up
    useGameStore.getState().resetSheepNames();
  });

  it('supports opening and closing customize modal panel', () => {
    useGameStore.getState().openCustomize();
    expect(useGameStore.getState().uiPanel).toBe('customize');

    useGameStore.getState().closeCustomize();
    expect(useGameStore.getState().uiPanel).toBe('none');
  });

  it('supports selecting curated dog camera angles for character inspection', () => {
    useGameStore.getState().openCustomize();
    expect(useGameStore.getState().customizeDogAngle).toBe('hero');
    expect(useGameStore.getState().customizeOrbitAngle).toBe(0);

    useGameStore.getState().setCustomizeDogAngle('face');
    expect(useGameStore.getState().customizeDogAngle).toBe('face');
    expect(useGameStore.getState().customizeOrbitAngle).toBe(0);

    useGameStore.getState().setCustomizeDogAngle('profile');
    expect(useGameStore.getState().customizeDogAngle).toBe('profile');

    useGameStore.getState().setCustomizeDogAngle('front');
    expect(useGameStore.getState().customizeDogAngle).toBe('front');

    useGameStore.getState().setCustomizeDogAngle('rear');
    expect(useGameStore.getState().customizeDogAngle).toBe('rear');

    useGameStore.getState().setCustomizeDogAngle('top');
    expect(useGameStore.getState().customizeDogAngle).toBe('top');

    useGameStore.getState().closeCustomize();
  });
});

