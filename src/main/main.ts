import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { GatewayClient } from './gateway-client';

let mainWindow: BrowserWindow | null = null;
let gatewayClient: GatewayClient | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In production, load the built files. In dev, load vite dev server.
  const isDev = process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    mainWindow.loadURL(isDev);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Gateway IPC handlers
function setupIPC() {
  ipcMain.handle('gateway:connect', async (_event, url: string, token?: string) => {
    try {
      if (gatewayClient) {
        gatewayClient.disconnect();
      }
      gatewayClient = new GatewayClient(url, token);
      await gatewayClient.connect();

      // Forward events to renderer
      gatewayClient.onEvent((event) => {
        mainWindow?.webContents.send('gateway:event', event);
      });

      gatewayClient.onSessionsUpdate((sessions) => {
        mainWindow?.webContents.send('gateway:sessions', sessions);
      });

      gatewayClient.onConnectionChange((status) => {
        mainWindow?.webContents.send('gateway:status', status);
      });

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:disconnect', async () => {
    gatewayClient?.disconnect();
    gatewayClient = null;
    return { ok: true };
  });

  ipcMain.handle('gateway:sessions', async () => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      const sessions = await gatewayClient.listSessions();
      return { ok: true, data: sessions };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:send', async (_event, sessionId: string, message: string) => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      await gatewayClient.sendMessage(sessionId, message);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  gatewayClient?.disconnect();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
