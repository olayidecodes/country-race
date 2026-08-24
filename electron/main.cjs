'use strict';

const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');

let mainWindow    = null;
let serverStarted = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    center: true,
    title: 'Country Race',
    backgroundColor: '#0d1b2a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'setup.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Start Express + WS server and optionally connect to TikTok.
// Uses dynamic import so CJS main can load the ESM server module.
ipcMain.handle('start-server', async (_event, { username, simulate }) => {
  if (serverStarted) return { ok: true };
  try {
    const { startServer } = await import('../server.js');
    await startServer({ username: username?.trim() || undefined, simulate });
    serverStarted = true;
    return { ok: true };
  } catch (err) {
    console.error('Server error:', err);
    return { ok: false, error: err?.message || String(err) };
  }
});

// Navigate the main window into the game view
ipcMain.on('open-game', () => {
  if (!mainWindow) return;
  mainWindow.setResizable(true);
  mainWindow.setSize(1280, 820, true);
  mainWindow.center();
  mainWindow.loadURL('http://localhost:8080');
  mainWindow.setMenuBarVisibility(false);
});

ipcMain.on('open-url', (_event, url) => shell.openExternal(url));
ipcMain.on('copy',     (_event, text) => clipboard.writeText(text));
