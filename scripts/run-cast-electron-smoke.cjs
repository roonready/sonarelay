const {spawn}=require('node:child_process');const path=require('node:path');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'cast-electron-smoke.cjs'),process.argv[2]||'192.168.1.2'],{env,windowsHide:true,stdio:'inherit'});
const deadline=setTimeout(()=>{child.kill();process.exitCode=1;},25000);child.on('exit',code=>{clearTimeout(deadline);process.exitCode=code??1;});child.on('error',error=>{clearTimeout(deadline);console.error(error);process.exitCode=1;});
