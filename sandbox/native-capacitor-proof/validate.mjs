// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const outDir = resolve(repoRoot, 'cycle53-validation/native/capacitor-android');
const resultPath = resolve(outDir, 'capacitor-android-proof.json');
const distRoot = resolve(repoRoot, 'dist');
const androidRoot = resolve(__dirname, 'android');

function commandStatus(command, args = [], options = {}) {
  const run = spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });
  return {
    command: [command, ...args].join(' '),
    ok: run.status === 0,
    status: run.status,
    stdout: run.stdout?.trim() || '',
    stderr: run.stderr?.trim() || '',
    error: run.error ? String(run.error.message || run.error) : ''
  };
}

function fileEvidence(path) {
  if (!existsSync(path)) {
    return { ok: false, path };
  }
  const stat = statSync(path);
  return {
    ok: stat.size > 0,
    path,
    bytes: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
}

async function safeList(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function findLocalJava() {
  const hostJdkRoot = resolve(repoRoot, 'cycle53-validation/native/android-host/jdk');
  const jdkDirs = await safeList(hostJdkRoot);
  for (const dir of jdkDirs) {
    const candidate = resolve(hostJdkRoot, dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (existsSync(candidate)) return candidate;
  }
  return 'java';
}

function findAndroidSdkRoot() {
  return process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || (process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Android/Sdk') : '');
}

function findAdb(sdkRoot) {
  const binary = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidate = sdkRoot ? resolve(sdkRoot, 'platform-tools', binary) : '';
  return candidate && existsSync(candidate) ? candidate : 'adb';
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const checks = [];
  const missing = [];

  const distIndex = existsSync(resolve(distRoot, 'index.html'));
  checks.push({ ok: distIndex, message: 'dist/index.html exists' });
  if (!distIndex) missing.push('native dist build');

  const androidExists = existsSync(androidRoot);
  checks.push({ ok: androidExists, message: 'Capacitor android project exists' });
  if (!androidExists) missing.push('Capacitor android project; run npm install && npx cap add android');

  const copiedIndex = existsSync(resolve(androidRoot, 'app/src/main/assets/public/index.html'));
  checks.push({ ok: copiedIndex, message: 'Android WebView assets include index.html' });
  if (!copiedIndex) missing.push('Capacitor sync output; run npm run sync:android');

  const javaCommand = await findLocalJava();
  const java = commandStatus(javaCommand, ['-version']);
  checks.push({ ok: java.ok, message: 'Java is available for Android Gradle build', details: java.stderr || java.stdout || java.error });
  if (!java.ok) missing.push('JDK for Android Gradle build');

  const androidSdkRoot = findAndroidSdkRoot();
  const adbCommand = findAdb(androidSdkRoot);
  const adb = commandStatus(adbCommand, ['devices']);
  const connectedDevices = adb.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /\tdevice$/.test(line));
  checks.push({ ok: adb.ok, message: 'adb command is available', details: adb.stdout || adb.stderr });
  checks.push({ ok: connectedDevices.length > 0, message: 'Android device/emulator is connected', details: connectedDevices });
  if (!adb.ok) missing.push('adb on PATH');
  if (connectedDevices.length === 0) missing.push('connected Android device or running emulator');

  const copiedAssets = await safeList(resolve(androidRoot, 'app/src/main/assets/public/assets'));
  checks.push({ ok: copiedAssets.length > 0, message: 'Android asset directory has built Vite assets', details: { count: copiedAssets.length } });

  const apk = fileEvidence(resolve(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk'));
  checks.push({ ok: apk.ok, message: 'Debug APK exists', details: apk });
  if (!apk.ok) missing.push('debug APK; run .\\android\\gradlew.bat -p android assembleDebug');

  const screenshots = {
    menu: fileEvidence(resolve(outDir, 'android-late.png')),
    loading: fileEvidence(resolve(outDir, 'android-play-tap.png')),
    gameplay: fileEvidence(resolve(outDir, 'android-field.png')),
    touchInput: fileEvidence(resolve(outDir, 'android-moved.png'))
  };
  const screenshotProofOk = Object.values(screenshots).every((shot) => shot.ok);
  checks.push({ ok: screenshotProofOk, message: 'Android boot, loading, gameplay, and touch-input screenshots exist', details: screenshots });
  if (!screenshotProofOk) missing.push('Android runtime screenshots from emulator/device proof');

  const runtimeProven = java.ok
    && adb.ok
    && connectedDevices.length > 0
    && apk.ok
    && screenshotProofOk;

  const result = {
    capturedAt: new Date().toISOString(),
    shell: 'capacitor-android',
    webDir: '../../dist',
    androidProject: androidRoot,
    androidSdkRoot,
    adbCommand,
    javaCommand,
    connectedDevices,
    apk,
    screenshots,
    checks,
    missing,
    status: runtimeProven ? 'boot-and-play-proven' : (missing.length === 0 ? 'ready-for-run-proof' : 'blocked-or-incomplete-runtime-proof'),
    ok: distIndex && androidExists && copiedIndex && copiedAssets.length > 0 && runtimeProven
  };

  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

run().catch(async (err) => {
  await mkdir(outDir, { recursive: true });
  const result = {
    capturedAt: new Date().toISOString(),
    shell: 'capacitor-android',
    ok: false,
    error: String(err?.stack || err)
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exit(1);
});
