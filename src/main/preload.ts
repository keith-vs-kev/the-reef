import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('reef', {
  gateway: {
    connect: (url: string, token?: string) => ipcRenderer.invoke('gateway:connect', url, token),
    disconnect: () => ipcRenderer.invoke('gateway:disconnect'),
    sessions: () => ipcRenderer.invoke('gateway:sessions'),
    send: (sessionId: string, message: string) => ipcRenderer.invoke('gateway:send', sessionId, message),
    onEvent: (cb: (event: any) => void) => {
      const listener = (_: any, event: any) => cb(event);
      ipcRenderer.on('gateway:event', listener);
      return () => ipcRenderer.removeListener('gateway:event', listener);
    },
    onSessions: (cb: (sessions: any[]) => void) => {
      const listener = (_: any, sessions: any[]) => cb(sessions);
      ipcRenderer.on('gateway:sessions', listener);
      return () => ipcRenderer.removeListener('gateway:sessions', listener);
    },
    onStatus: (cb: (status: string) => void) => {
      const listener = (_: any, status: string) => cb(status);
      ipcRenderer.on('gateway:status', listener);
      return () => ipcRenderer.removeListener('gateway:status', listener);
    },
  },
});
