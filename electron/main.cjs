const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

let mainWindow = null;
let pyProc = null;
let backendPort = 8765;
let backendUrl = `http://127.0.0.1:${backendPort}`;

function findFreePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(findFreePort(start + 1)));
    srv.once('listening', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.listen(start, '127.0.0.1');
  });
}

function getPythonCmd() {
  // Ưu tiên venv local -> py -> python -> python3
  const candidates = [];
  const venvWin = path.join(__dirname, '..', 'python-core', 'venv', 'Scripts', 'python.exe');
  const venvNix = path.join(__dirname, '..', 'python-core', 'venv', 'bin', 'python');
  if (fs.existsSync(venvWin)) candidates.push(venvWin);
  if (fs.existsSync(venvNix)) candidates.push(venvNix);
  if (process.platform === 'win32') candidates.push('py', 'python');
  else candidates.push('python3', 'python');
  return candidates;
}

function getDbPath() {
  const userData = app.getPath('userData');
  try { fs.mkdirSync(userData, { recursive: true }); } catch {}
  return path.join(userData, 'onluyen.db');
}

function waitForBackend(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) { clearInterval(timer); resolve(true); return; }
      } catch {}
      if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('Backend timeout')); }
    }, 400);
  });
}

async function startPythonBackend() {
  backendPort = await findFreePort(8765);
  backendUrl = `http://127.0.0.1:${backendPort}`;
  const dbPath = getDbPath();
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'python-core', 'main.py')
    : path.join(__dirname, '..', 'python-core', 'main.py');

  const cmds = getPythonCmd();
  console.log('[main] backend port:', backendPort);
  console.log('[main] db:', dbPath);
  console.log('[main] script:', script);

  if (!fs.existsSync(script)) {
    console.warn('[main] python script not found, skip backend spawn:', script);
    return;
  }

  const trySpawn = (idx) => {
    if (idx >= cmds.length) {
      console.error('[main] Khong tim thay Python. Hay cai Python 3.10+.');
      return;
    }
    const cmd = cmds[idx];
    const args = (cmd === 'py' ? ['-3'] : []).concat([script, '--port', String(backendPort), '--db-path', dbPath]);
    console.log(`[main] thu chay backend: ${cmd} ${args.join(' ')}`);
    try {
      pyProc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      console.warn('[main] spawn loi, thu lenh khac', e.message);
      trySpawn(idx + 1);
      return;
    }
    let started = false;
    pyProc.stdout.on('data', (d) => { console.log('[py]', String(d).trim()); });
    pyProc.stderr.on('data', (d) => { console.log('[py-err]', String(d).trim()); });
    pyProc.on('error', (err) => {
      console.warn(`[main] khong chay duoc "${cmd}":`, err.message);
      if (!started) { pyProc = null; trySpawn(idx + 1); }
    });
    // coi như started sau khi spawn ok, main window sẽ waitForBackend
    started = true;
  };
  trySpawn(0);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Ôn luyện HSG THPT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('backend:getUrl', () => backendUrl);
ipcMain.handle('backend:getStatus', async () => {
  try {
    const r = await fetch(`${backendUrl}/api/health`);
    const j = await r.json();
    return { ok: r.ok, url: backendUrl, data: j };
  } catch (e) {
    return { ok: false, url: backendUrl, error: String(e) };
  }
});

app.whenReady().then(async () => {
  await startPythonBackend();
  createWindow();
  // đợi backend sẵn sàng rồi báo cho renderer
  waitForBackend(backendUrl).then(() => {
    console.log('[main] backend ready:', backendUrl);
    if (mainWindow) mainWindow.webContents.send('backend:ready', backendUrl);
  }).catch((e) => console.warn('[main]', e.message));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (pyProc) {
    try { pyProc.kill(); } catch {}
    pyProc = null;
  }
});
