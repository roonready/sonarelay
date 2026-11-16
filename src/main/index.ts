import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import path from 'node:path';
import { Discovery } from './discovery/ssdp';
import { registerHandlers } from './ipc/handlers';
import { configureBackgroundAudio } from './runtime/background-audio';
import { registerMetadata } from './metadata/ipc';
import { registerLastfm } from './lastfm/ipc';
import { registerUpdates } from './updates/ipc';
import { configureProfile } from './runtime/profile';
configureBackgroundAudio(app.commandLine);
const PANEL_WIDTH = 300;
const profile = configureProfile(app);
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
  let browser: WebContentsView | undefined;
  let cleanupMetadata = () => {};
  let musicTask: Promise<void> | undefined;
  const lastfm=registerLastfm(window.webContents,profile.credentialsFallback);
  const captureSession = window.webContents.session;
  captureSession.setDisplayMediaRequestHandler((request, callback) => {
    if (window.isDestroyed() || !browser || browser.webContents.isDestroyed() || request.frame !== window.webContents.mainFrame || !request.audioRequested) {
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
    browser?.setBounds({ x: PANEL_WIDTH, y: 0, width: Math.max(0, width - PANEL_WIDTH), height });
  };
  layout(); window.on('resize', layout);
  const closeMusic = () => {
    cleanupMetadata(); cleanupMetadata=()=>{};
    const current=browser;browser=undefined;musicTask=undefined;
    if(current){window.contentView.removeChildView(current);if(!current.webContents.isDestroyed())current.webContents.close();}
  };
  const openMusic = ():Promise<void> => {
    if(browser&&!browser.webContents.isDestroyed())return musicTask??Promise.resolve();
    const view=browser=new WebContentsView({webPreferences:{partition:'persist:yandex-music',contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    window.contentView.addChildView(view);layout();
    view.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))void view.webContents.loadURL(url).catch(console.error);return {action:'deny'};});
    view.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('https://'))event.preventDefault();});
    cleanupMetadata=registerMetadata(window.webContents,view.webContents,lastfm.consume);
    musicTask=view.webContents.loadURL('https://music.yandex.ru/').catch(error=>{if(browser===view)closeMusic();throw error;});
    return musicTask;
  };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const discovery = new Discovery();
  const cleanup = registerHandlers(window, discovery,{openMusic,closeMusic,onRadioPlayback:playback=>lastfm.consume({source:'radio',fields:[],artwork:null,updatedAt:Date.now(),error:'',playback})});
  const ready = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
    : window.loadFile(path.join(__dirname, '../renderer/index.html'));
  let closing=false;
  let shutdownComplete=false;
  let shutdownTask: Promise<void> | undefined;
  const shutdown = () => {
    if (shutdownTask) return shutdownTask;
    closing=true;
    closeMusic();
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
  window.on('close', event => {
    if(shutdownComplete)return;
    event.preventDefault();
    if(closing)return;
    void shutdown().catch(error=>console.error('Shutdown:',error)).finally(()=>{
      closeMusic();
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
