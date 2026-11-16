const {app}=require('electron');app.whenReady().then(()=>require('./test-airplay2.cjs')).then(()=>app.exit(process.exitCode??0)).catch(error=>{console.error(error);app.exit(1);});
