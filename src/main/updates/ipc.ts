import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UpdateService } from './service';

// A download may fail after its window has closed. Keep an app-lifetime listener
// so EventEmitter does not turn that late failure into an uncaught exception.
autoUpdater.on('error', () => {});

export function registerUpdates(window: BrowserWindow, beforeInstall: () => Promise<void>) {
  const service = new UpdateService(autoUpdater, app.getVersion(), app.isPackaged && process.platform === 'win32', beforeInstall);
  const channels = ['updates:get', 'updates:check', 'updates:install'];
  let disposed = false;
  const send = () => { if (!disposed && !window.webContents.isDestroyed()) window.webContents.send('updates:state', { ...service.state }); };
  service.on('state', send);
  const handle = (channel: string, action: () => unknown) => ipcMain.handle(channel, event => {
    if (disposed || event.sender !== window.webContents) throw new Error('Forbidden');
    return action();
  });
  handle(channels[0], () => ({ ...service.state }));
  handle(channels[1], () => service.check());
  handle(channels[2], () => service.install());
  return {
    start: () => { if (!disposed) void service.check(); },
    dispose: () => { disposed = true; service.dispose(); for (const channel of channels) ipcMain.removeHandler(channel); },
  };
}
