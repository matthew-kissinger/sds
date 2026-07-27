// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { listScenes } from '../../shared/scenes/index.js';
import { getSoloLadder } from '../../shared/difficulty.js';
import {
  COUNTING_CURVES,
  COUNTING_HARD_CEILING,
  sceneOffersCounting,
} from '../../shared/countingModes.js';
import { SandboxConfig } from '../../js/SandboxConfig.js';

const DIAGNOSTIC_SCENE_ID = 'newsheepdogland';
const WORLD_NAMES = Object.freeze({
  field: 'Home Field',
  'rolling-hills': 'Rolling Hills',
  'open-country': 'Open Country',
  newsheepdogland: 'Newsheepdogland',
});

const DOGS = Object.freeze([
  { id: 'jep', name: 'Jep' },
  { id: 'pip', name: 'Pip' },
  { id: 'sally', name: 'Sally' },
  { id: 'shiloh', name: 'Shiloh' },
  { id: 'george_washington', name: 'George Washington' },
]);

function sceneName(scene) {
  return WORLD_NAMES[scene.id] ?? scene.displayName ?? scene.name ?? scene.id
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function soloCase(scene, rung, dog = DOGS[0]) {
  return {
    id: `${scene.id}-solo-${rung.id}-${dog.id}`,
    sceneId: scene.id,
    worldName: sceneName(scene),
    familyName: scene.id === 'open-country' ? 'Objective' : 'Solo',
    gameMode: 'solo',
    rungId: rung.id,
    rungName: rung.label ?? rung.id,
    sheepCount: rung.count,
    cpuStress: rung.count >= 5000,
    dogId: dog.id,
    dogName: dog.name,
    diagnostic: scene.id === DIAGNOSTIC_SCENE_ID,
    coverRequired: scene.id !== DIAGNOSTIC_SCENE_ID,
    flow: 'entrance',
  };
}

function countingCase(scene, curve, dog = DOGS[0]) {
  const name = curve[0].toUpperCase() + curve.slice(1);
  return {
    id: `${scene.id}-counting-${curve}-${dog.id}`,
    sceneId: scene.id,
    worldName: sceneName(scene),
    familyName: 'Counting Sheep',
    gameMode: 'counting',
    rungId: curve,
    rungName: name,
    sheepCount: COUNTING_HARD_CEILING,
    cpuStress: true,
    dogId: dog.id,
    dogName: dog.name,
    diagnostic: false,
    coverRequired: true,
    flow: 'entrance',
  };
}

export function buildCoreCases({ includeDiagnostic = false } = {}) {
  const cases = [];
  for (const scene of listScenes()) {
    if (scene.id === DIAGNOSTIC_SCENE_ID && !includeDiagnostic) continue;
    if (scene.id === DIAGNOSTIC_SCENE_ID) {
      cases.push(soloCase(scene, { id: 'survival', label: 'Survival', count: 10 }));
      continue;
    }
    for (const rung of getSoloLadder(scene)) cases.push(soloCase(scene, rung));
    if (sceneOffersCounting(scene.id)) {
      for (const curve of COUNTING_CURVES) cases.push(countingCase(scene, curve));
    }
  }
  return cases;
}

export function buildCompleteCases({ includeDiagnostic = false } = {}) {
  const cases = buildCoreCases({ includeDiagnostic });
  const field = listScenes().find((scene) => scene.id === 'field');
  const practice = getSoloLadder(field).find((rung) => rung.id === 'practice');
  for (const dog of DOGS.slice(1)) cases.push(soloCase(field, practice, dog));
  return cases;
}

export function buildSmokeCases() {
  const scenes = listScenes().filter((scene) => scene.id !== DIAGNOSTIC_SCENE_ID);
  const cases = scenes.map((scene) => soloCase(scene, getSoloLadder(scene)[0]));
  const field = scenes.find((scene) => scene.id === 'field');
  const maxRung = getSoloLadder(field).reduce((best, rung) => rung.count > best.count ? rung : best);
  cases.push(soloCase(field, maxRung));
  return cases;
}

function sandboxCase(scene, sheepCount) {
  const config = SandboxConfig.createDefault();
  config.sceneId = scene.id;
  config.sheep.count = sheepCount;
  return {
    id: `${scene.id}-sandbox-${sheepCount}-jep`,
    flow: 'sandbox',
    sceneId: scene.id,
    worldName: sceneName(scene),
    familyName: 'Sandbox',
    gameMode: 'sandbox',
    rungId: String(sheepCount),
    rungName: `${sheepCount} sheep`,
    sheepCount,
    cpuStress: sheepCount >= 5000,
    dogId: DOGS[0].id,
    dogName: DOGS[0].name,
    diagnostic: false,
    coverRequired: true,
    sandboxHash: config.serialize(),
  };
}

function localCase(mode) {
  const field = listScenes().find((scene) => scene.id === 'field');
  return {
    id: `field-local-${mode.id}`,
    flow: 'local',
    sceneId: field.id,
    worldName: sceneName(field),
    familyName: 'Local 2-Player',
    gameMode: 'local',
    rungId: mode.id,
    rungName: mode.label,
    sheepCount: mode.sheepCount,
    dogId: DOGS[0].id,
    dogName: DOGS[0].name,
    diagnostic: false,
    coverRequired: true,
    localModeLabel: mode.label,
  };
}

export function buildModeCases() {
  const publicScenes = listScenes().filter((scene) => scene.id !== DIAGNOSTIC_SCENE_ID);
  const sandbox = publicScenes.flatMap((scene) => [sandboxCase(scene, 10), sandboxCase(scene, 5000)]);
  const local = [
    { id: 'coop', label: 'Co-op', sheepCount: 200 },
    { id: 'versus', label: '1v1 Race', sheepCount: 200 },
    { id: 'timed', label: 'Timed', sheepCount: 200 },
  ].map(localCase);
  return [...sandbox, ...local];
}

export const PLAY_START_DOGS = DOGS;
