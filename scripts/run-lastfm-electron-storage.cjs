const {spawn}=require('node:child_process'),path=require('node:path');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'lastfm-electron-storage.cjs')],{env,windowsHide:true,stdio:'inherit'});const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},20000);
child.on('exit',code=>{clearTimeout(timeout);process.exitCode=code??1;});child.on('error',error=>{clearTimeout(timeout);console.error(error);process.exitCode=1;});
