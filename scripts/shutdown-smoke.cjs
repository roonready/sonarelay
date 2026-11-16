const {app,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const directory=path.resolve(__dirname,'../.verification');fs.mkdirSync(directory,{recursive:true});
const profile=path.join(directory,'shutdown-profile');fs.mkdirSync(profile,{recursive:true});
app.commandLine.appendSwitch('user-data-dir',profile);app.setPath('userData',profile);
let windowCreated=false,closeRequested=false;
const errors=[];
const record=(error)=>{errors.push(String(error?.stack||error));console.error(errors[errors.length-1]);};
process.on('uncaughtException',error=>{record(error);app.exit(1);});
process.on('unhandledRejection',error=>{record(error);app.exit(1);});
dialog.showErrorBox=(title,message)=>{record(title+': '+message);app.exit(1);};
const deadline=setTimeout(()=>{record('Shutdown timed out');app.exit(1);},20000);
app.on('browser-window-created',(_event,window)=>{
 if(windowCreated)return;windowCreated=true;
 window.once('ready-to-show',()=>setTimeout(()=>{closeRequested=true;window.close();if(!window.isDestroyed())window.close();},100));
});
app.on('will-quit',()=>{
 clearTimeout(deadline);
 const result={windowCreated,closeRequested,uncaughtErrors:errors};
 fs.writeFileSync(path.join(directory,'shutdown-smoke.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 if(!windowCreated||!closeRequested||errors.length)process.exitCode=1;
});
require('../out/main/index.js');
