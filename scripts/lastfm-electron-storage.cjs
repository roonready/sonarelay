const {app,safeStorage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const directory=path.resolve(__dirname,'../.verification/lastfm-safe-storage');app.setPath('userData',directory);
const timeout=setTimeout(()=>{console.error('safeStorage timeout');app.exit(1);},15000);
app.whenReady().then(async()=>{
 require('./register-ts.cjs');const {LastfmStorage}=require('../src/main/lastfm/storage.ts');
 const storage=new LastfmStorage(directory,{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
 const session={key:'test-only-session-key-00000000001',name:'Smoke test',apiKey:'test-api-key'};
 await storage.saveSession(session);const raw=await fs.readFile(path.join(directory,'lastfm-session.bin'));assert.ok(!raw.includes(Buffer.from(session.key)));assert.deepEqual(await storage.loadSession(),session);await storage.removeSession();
 await assert.rejects(fs.access(path.join(directory,'lastfm-session.bin')));console.log(JSON.stringify({electron:process.versions.electron,safeStorage:true,roundTrip:true,noPlaintext:true,sessionDeleted:true}));clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
