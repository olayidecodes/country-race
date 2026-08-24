import { app, BrowserWindow, ipcMain, shell, clipboard, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startServer } from '../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let serverStarted = false;

function createSetupWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    center: true,
    title: 'Country Race',
    backgroundColor: '#0d1b2a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, 'setup.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createSetupWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Start the Express/WS server and optionally connect to TikTok
ipcMain.handle('start-server', async (_event, { username, simulate }) => {
  if (serverStarted) return { ok: true };
  try {
    await startServer({ username: username?.trim() || undefined, simulate });
    serverStarted = true;
    return { ok: true };
  } catch (err) {
    console.error('Server start error:', err);
    return { ok: false, error: err?.message || String(err) };
  }
});

// Navigate main window to the game
ipcMain.on('open-game', () => {
  if (!mainWindow) return;
  mainWindow.setResizable(true);
  mainWindow.setSize(1280, 820, true);
  mainWindow.center();
  mainWindow.loadURL('http://localhost:8080');
  mainWindow.setMenuBarVisibility(false);
});

// Open settings in the system browser
ipcMain.on('open-url', (_event, url) => {
  shell.openExternal(url);
});

// Copy text to clipboard
ipcMain.on('copy', (_event, text) => {
  clipboard.writeText(text);
});
