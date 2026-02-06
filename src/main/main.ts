import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { GatewayClient } from './gateway-client';

let mainWindow: BrowserWindow | null = null;
let gatewayClient: GatewayClient | null = null;

// Default gateway config — reads from env or hardcoded local defaults
const GATEWAY_URL = process.env.REEF_GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.REEF_GATEWAY_TOKEN || '37ac13cf2412f78ac4e1aec254131791';

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

async function connectGateway(url: string, token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (gatewayClient) {
      gatewayClient.disconnect();
    }
    gatewayClient = new GatewayClient(url, token);
    await gatewayClient.connect();

    gatewayClient.onEvent((event) => {
      mainWindow?.webContents.send('gateway:event', event);
    });

    gatewayClient.onConnectionChange((status) => {
      mainWindow?.webContents.send('gateway:status', status);
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

function setupIPC() {
  ipcMain.handle('gateway:connect', async (_event, url: string, token?: string) => {
    return connectGateway(url, token || GATEWAY_TOKEN);
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

  ipcMain.handle('gateway:chat-history', async (_event, sessionKey: string, limit?: number) => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      const messages = await gatewayClient.chatHistory(sessionKey, limit);
      return { ok: true, data: messages };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:usage-cost', async () => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      const usage = await gatewayClient.usageCost();
      return { ok: true, data: usage };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:status', async () => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      const status = await gatewayClient.getStatus();
      return { ok: true, data: status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:send', async (_event, sessionId: string, message: string) => {
    if (!gatewayClient) return { ok: false, error: 'Not connected' };
    try {
      // Not yet implemented in gateway client
      return { ok: false, error: 'Send not yet implemented' };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(async () => {
  setupIPC();
  createWindow();

  // Auto-connect after page loads
  mainWindow?.webContents.on('did-finish-load', async () => {
    const result = await connectGateway(GATEWAY_URL, GATEWAY_TOKEN);
    if (result.ok) {
      mainWindow?.webContents.send('gateway:status', 'connected');
      try {
        const sessions = await gatewayClient!.listSessions();
        mainWindow?.webContents.send('gateway:sessions-data', sessions);
        const usage = await gatewayClient!.usageCost();
        mainWindow?.webContents.send('gateway:usage-data', usage);
      } catch {}
    } else {
      mainWindow?.webContents.send('gateway:status', 'error');
    }
  });
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
