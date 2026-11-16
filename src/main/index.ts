import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { Discovery } from './discovery/ssdp';
import { registerHandlers } from './ipc/handlers';
import { configureBackgroundAudio } from './runtime/background-audio';
import { registerMetadata } from './metadata/ipc';
import { registerLastfm } from './lastfm/ipc';
import { registerUpdates } from './updates/ipc';
configureBackgroundAudio(app.commandLine);
const PANEL_WIDTH = 300;
// Preserve the existing login/session path when the packaged product name changes.
if(!app.commandLine.hasSwitch('user-data-dir'))app.setPath('userData',path.join(app.getPath('appData'),'sonarelay'));
function createWindow() {
  const window = new BrowserWindow({
    width: 1500, height: 900, minWidth: 950, minHeight: 600,
    title: 'SonaRelay', icon: path.join(app.getAppPath(), 'assets/icon.png'), backgroundColor: '#11151e', autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling:false },
  });
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  const browser = new WebContentsView({ webPreferences: {
    partition: 'persist:yandex-music', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling:false,
  } });
  window.contentView.addChildView(browser);
  const captureSession = window.webContents.session;
  captureSession.setDisplayMediaRequestHandler((request, callback) => {
    if (window.isDestroyed() || browser.webContents.isDestroyed() || request.frame !== window.webContents.mainFrame || !request.audioRequested) {
      callback(null); return;
    }
    // Suppress local speakers while preserving this tab's captured audio for DLNA.
    callback({ video: browser.webContents.mainFrame, audio: browser.webContents.mainFrame, enableLocalEcho: false });
  });
  captureSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents === window.webContents && permission === 'display-capture');
  });
  const layout = () => {
    const [width, height] = window.getContentSize();
    browser.setBounds({ x: PANEL_WIDTH, y: 0, width: Math.max(0, width - PANEL_WIDTH), height });
  };
  layout(); window.on('resize', layout);
  browser.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://')) void browser.webContents.loadURL(url).catch(console.error);
    return { action: 'deny' };
  });
  browser.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const discovery = new Discovery();
  const cleanup = registerHandlers(window, discovery);
  const lastfm=registerLastfm(window.webContents);
  const cleanupMetadata=registerMetadata(window.webContents,browser.webContents,lastfm.consume);
  const ready = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
    : window.loadFile(path.join(__dirname, '../renderer/index.html'));
  let closing=false;
  let shutdownComplete=false;
  let shutdownTask: Promise<void> | undefined;
  const shutdown = () => {
    if (shutdownTask) return shutdownTask;
    closing=true;
    cleanupMetadata();
    const lastfmShutdown=lastfm.dispose();
    captureSession.setDisplayMediaRequestHandler(null);
    captureSession.setPermissionRequestHandler(null);
    shutdownTask=cleanup().then(()=>discovery.dispose(),async error=>{await discovery.dispose();throw error;}).then(()=>lastfmShutdown);
    return shutdownTask;
  };
  const updates=registerUpdates(window,async()=>{await shutdown().catch(error=>console.error('Shutdown:',error));shutdownComplete=true;});
  window.on('closed',()=>updates.dispose());
  void ready.then(() => {
    if (!closing) updates.start();
    if (!closing&&discovery.state.selectedAddress) void discovery.scan(discovery.state.selectedAddress).catch(console.error);
  }).catch(error=>{if(!closing)console.error('UI load:',error);});
  void browser.webContents.loadURL('https://music.yandex.ru/').catch(console.error);
  window.on('close', event => {
    if(shutdownComplete)return;
    event.preventDefault();
    if(closing)return;
    void shutdown().catch(error=>console.error('Shutdown:',error)).finally(()=>{
      if(!browser.webContents.isDestroyed())browser.webContents.close();
      shutdownComplete=true;
      if(!window.isDestroyed())window.close();
    });
  });
}
app.whenReady().then(() => {
  ipcMain.handle('app:system-language', event => {
    if (!BrowserWindow.getAllWindows().some(window => window.webContents === event.sender)) throw new Error('Forbidden');
    return app.getSystemLocale();
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
