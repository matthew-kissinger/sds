// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
const { app, BrowserWindow, Menu, crashReporter, net, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sds',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const shellRoot = __dirname;
const repoRoot = path.resolve(shellRoot, '..', '..');
const productName = 'Sheep Dog Simulator';
const appId = 'com.matthewkissinger.sheepdogsim';

app.setName(productName);
if (process.platform === 'win32') {
  app.setAppUserModelId(appId);
}

if (process.env.SDS_DESKTOP_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.SDS_DESKTOP_USER_DATA));
}

const distRoot = path.resolve(process.env.SDS_DESKTOP_DIST || (app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(repoRoot, 'dist')));

const userDataRoot = app.getPath('userData');
const logsRoot = path.join(userDataRoot, 'logs');
const crashRoot = path.join(userDataRoot, 'crash-dumps');
fs.mkdirSync(logsRoot, { recursive: true });
fs.mkdirSync(crashRoot, { recursive: true });
app.setPath('crashDumps', crashRoot);

const logPath = path.join(logsRoot, 'sds-desktop.log');
function appendLog(level, message, detail = null) {
  const suffix = detail ? ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${level}] ${message}${suffix}\n`);
}

crashReporter.start({
  uploadToServer: false,
  compress: true
});

process.on('uncaughtException', (err) => {
  appendLog('fatal', 'uncaughtException', err?.stack || String(err));
});
process.on('unhandledRejection', (reason) => {
  appendLog('fatal', 'unhandledRejection', reason?.stack || String(reason));
});

function fileForRequest(url) {
  const parsed = new URL(url);
  const requestedPath = decodeURIComponent(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
  const filePath = path.resolve(distRoot, `.${requestedPath}`);
  const relative = path.relative(distRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return fs.existsSync(filePath) ? filePath : null;
}

async function registerDistProtocol() {
  protocol.handle('sds', async (request) => {
    const filePath = fileForRequest(request.url);
    if (!filePath) {
      appendLog('warn', 'protocol 404', request.url);
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function buildDefaultUrl() {
  const url = new URL('sds://app/index.html');
  url.searchParams.set('nativeShell', 'electron-desktop');
  url.searchParams.set('scene', process.env.SDS_DESKTOP_SCENE || 'field');
  url.searchParams.set('perfMode', process.env.SDS_DESKTOP_PERF_MODE || '1');
  const renderer = process.env.SDS_DESKTOP_RENDERER;
  if (renderer && renderer !== 'default') {
    url.searchParams.set('renderer', renderer);
  }
  return url.href;
}

function registerPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const pageUrl = webContents.getURL() || '';
    const requestingUrl = details?.requestingUrl || pageUrl;
    const localApp = pageUrl.startsWith('sds://app') || requestingUrl.startsWith('sds://app');
    const localGamePermission = permission === 'pointerLock' || permission === 'fullscreen';
    callback(localApp && localGamePermission);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    resizable: true,
    title: productName,
    backgroundColor: '#111111',
    show: process.env.SDS_DESKTOP_SHOW !== '0',
    autoHideMenuBar: true,
    fullscreen: process.env.SDS_DESKTOP_FULLSCREEN === '1',
    icon: path.join(shellRoot, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env.SDS_DESKTOP_DEVTOOLS === '1'
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    appendLog('fatal', 'render-process-gone', details);
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) appendLog('renderer', message);
  });

  win.loadURL(process.env.SDS_DESKTOP_URL || buildDefaultUrl());
  return win;
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  appendLog('info', 'starting', {
    appId,
    version: app.getVersion(),
    distRoot,
    userDataRoot,
    crashRoot,
    packaged: app.isPackaged
  });
  await registerDistProtocol();
  registerPermissionHandler();
  createWindow();
});

app.on('window-all-closed', () => {
  appendLog('info', 'window-all-closed');
  app.quit();
});
