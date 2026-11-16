const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
require('./register-ts.cjs');
app.setPath('userData',path.resolve(__dirname,'../.verification/profile-lock-smoke'));
const {configureProfile}=require('../src/main/runtime/profile.ts');
const profile=configureProfile(app);
if(!profile.ownsInstance){console.log('secondary-window-skipped');app.exit(0);}
else{
 let window;
 const timer=setTimeout(()=>app.exit(1),15000);
 app.on('second-instance',()=>{console.log('primary-received-second-instance');});
 const quitFile=path.resolve(__dirname,'../.verification/profile-lock-smoke/quit');
 const poll=setInterval(()=>{if(fs.existsSync(quitFile)){clearInterval(poll);clearTimeout(timer);window?.destroy();app.quit();}},50);
 app.whenReady().then(async()=>{
  window=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
  await window.loadURL('data:text/html,<title>Profile smoke</title>');
  console.log('primary-ready');
 });
}
