const {app,webContents}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(root,'.verification/consent-ui-'));
app.commandLine.appendSwitch('user-data-dir',directory);app.setPath('userData',directory);app.getAppPath=()=>root;
delete process.env.ELECTRON_RENDERER_URL;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const timeout=setTimeout(()=>{console.error('Consent UI timed out');app.exit(1);},45000);
let launches=0,primary;
app.on('web-contents-created',(_event,contents)=>{
 if(!primary){primary=contents;return;}
 if(contents!==primary){
  contents.loadURL=async()=>{assert.ok(JSON.parse(fs.readFileSync(path.join(directory,'music-consent.json'),'utf8')).version===1);launches++;};
 }
});
app.on('browser-window-created',(_event,window)=>{
 window.show=()=>{};window.maximize=()=>{};
 window.webContents.once('did-finish-load',async()=>{
  const run=code=>window.webContents.executeJavaScript(code).catch(error=>{throw new Error(code+': '+error.message);});
  const browsers=()=>webContents.getAllWebContents().filter(c=>c!==window.webContents&&!c.isDestroyed()).length;
  const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  try{
   await delay(400);
   await run("localStorage.setItem('sonarelay.language','ru')");
   await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});await delay(200);
   await assert.rejects(run('window.bridge.openMusic()'));assert.equal(browsers(),0);
   await click('.radio-player button:last-child');await delay(200);
   assert.equal(await run("document.querySelector('dialog').open"),true);assert.equal(browsers(),0);
   assert.equal((await run('window.bridge.musicConsent()')).accepted,false);
   await click('.consent-cancel');await delay(100);assert.equal(await run("!!document.querySelector('dialog')"),false);assert.equal(browsers(),0);
   await click('.radio-player button:last-child');await delay(100);
   const screenshots=path.join(root,'.verification/screenshots');fs.mkdirSync(screenshots,{recursive:true});
   window.setSize(1100,950);await delay(150);
   fs.writeFileSync(path.join(screenshots,'yandex-signin-notice.png'),(await window.webContents.capturePage()).toPNG());
   window.setSize(800,600);await delay(150);
   const layout=await run("(()=>{const d=document.querySelector('dialog').getBoundingClientRect(),b=document.querySelector('.consent-continue').getBoundingClientRect(),body=document.querySelector('.consent-body');return {top:d.top,bottom:d.bottom,buttonBottom:b.bottom,height:innerHeight,scroll:body.scrollHeight>body.clientHeight}})()");
   assert.ok(layout.top>=0&&layout.bottom<=layout.height&&layout.buttonBottom<=layout.height);assert.equal(layout.scroll,true);
   fs.writeFileSync(path.join(screenshots,'yandex-signin-notice-compact.png'),(await window.webContents.capturePage()).toPNG());
   await click('.consent-continue');await delay(500);assert.equal((await run('window.bridge.musicConsent()')).accepted,true);assert.equal(browsers(),1);
   assert.equal(await run("!!document.querySelector('dialog')"),false);
   await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});await delay(150);
   await click('.radio-player button:last-child');await delay(150);assert.equal(await run("!!document.querySelector('dialog')"),false);
   fs.writeFileSync(path.join(directory,'music-consent.json'),JSON.stringify({version:0,acceptedAt:new Date().toISOString()}));
   await click('.radio-player button:last-child');await delay(150);assert.equal(await run("document.querySelector('dialog').open"),true);
   console.log(JSON.stringify({firstChoice:true,mainProcessGate:true,cancelPreservesSource:true,persistedConsent:true,reloadSkipsNotice:true,versionReprompts:true,compactLayout:layout,screenshots}));
   clearTimeout(timeout);window.close();
  }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
 });
});
require('../out/main/index.js');
