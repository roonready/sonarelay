import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { Discovery } from './discovery/ssdp';
import { registerHandlers } from './ipc/handlers';
import { configureBackgroundAudio } from './runtime/background-audio';
import { loopbackSampleRate, registerWindowsMedia } from './runtime/windows-media';
import { registerLastfm } from './lastfm/ipc';
import { registerUpdates } from './updates/ipc';
import { configureProfile } from './runtime/profile';
configureBackgroundAudio(app.commandLine);
const profile = configureProfile(app);
function createWindow() {
  const window = new BrowserWindow({
    width: 320, height: 520, minWidth: 270, minHeight: 300,
    alwaysOnTop: true, maximizable: false,
    title: 'SonaRelay', icon: path.join(app.getAppPath(), 'assets/icon.png'), backgroundColor: '#11151e', autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling:false },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  const lastfm=registerLastfm(window.webContents,profile.credentialsFallback);
  const media = registerWindowsMedia(window.webContents, lastfm.consume);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const discovery = new Discovery();
  const cleanup = registerHandlers(window, discovery, {
    capture: media.capture, sampleRate: loopbackSampleRate,
  });
  const ready = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
    : window.loadFile(path.join(__dirname, '../renderer/index.html'));
  let closing=false;
  let shutdownComplete=false;
  let shutdownTask: Promise<void> | undefined;
  const shutdown = () => {
    if (shutdownTask) return shutdownTask;
    closing=true;
    const lastfmShutdown=lastfm.dispose();
    const metadataShutdown=media.dispose();
    shutdownTask=Promise.allSettled([cleanup(), lastfmShutdown, metadataShutdown]).then(async results=>{
      await discovery.dispose();
      for (const result of results) if (result.status==='rejected') throw result.reason;
    });
    return shutdownTask;
  };
  const updates=registerUpdates(window,async()=>{await shutdown().catch(error=>console.error('Shutdown:',error));shutdownComplete=true;});
  window.on('closed',()=>updates.dispose());
  void ready.then(() => {
    if (!closing) updates.start();
    if (!closing&&discovery.state.selectedAddress) void discovery.scan(discovery.state.selectedAddress).catch(console.error);
  }).catch(error=>{if(!closing)console.error('UI load:',error);});
  window.on('close', event => {
    if(shutdownComplete)return;
    event.preventDefault();
    if(closing)return;
    void shutdown().catch(error=>console.error('Shutdown:',error)).finally(()=>{
      shutdownComplete=true;
      if(!window.isDestroyed())window.close();
    });
  });
}
if(!profile.ownsInstance){
  // No windows/resources exist in this process. Exit before Chromium initializes
  // a second GPU/disk cache against the profile owned by the primary instance.
  app.exit(0);
}else{
app.on('second-instance',()=>{
  const window=BrowserWindow.getAllWindows()[0];
  if(window){if(window.isMinimized())window.restore();window.show();window.focus();}
});
app.whenReady().then(() => {
  ipcMain.handle('app:system-language', event => {
    if (!BrowserWindow.getAllWindows().some(window => window.webContents === event.sender)) throw new Error('Forbidden');
    return app.getSystemLocale();
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
