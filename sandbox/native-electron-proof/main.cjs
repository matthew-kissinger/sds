const { app, BrowserWindow, net, protocol } = require('electron');
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

const proofRoot = __dirname;
const repoRoot = path.resolve(proofRoot, '..', '..');
const distRoot = path.resolve(process.env.SDS_NATIVE_DIST || (app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(repoRoot, 'dist')));

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
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#111111',
    show: process.env.SDS_NATIVE_SHOW !== '0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.removeMenu();
  win.loadURL(process.env.SDS_NATIVE_URL || 'sds://app/index.html?nativeProof=electron&scene=field');
  return win;
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}

app.whenReady().then(async () => {
  await registerDistProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
