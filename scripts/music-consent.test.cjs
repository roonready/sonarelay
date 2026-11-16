require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {MusicConsentStore}=require('../src/main/runtime/music-consent.ts');
const {MUSIC_CONSENT_VERSION}=require('../src/shared/music-consent.ts');
test('consent persists only for the current notice version and requires explicit acceptance',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sona-consent-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const store=new MusicConsentStore(dir);
 assert.equal((await store.state()).accepted,false);await assert.rejects(store.requireAccepted(),/required/);
 await assert.rejects(store.accept(MUSIC_CONSENT_VERSION+1),/changed/);
 await store.accept(MUSIC_CONSENT_VERSION);await new MusicConsentStore(dir).requireAccepted();
 const file=path.join(dir,'music-consent.json'),record=JSON.parse(await fs.readFile(file,'utf8'));
 assert.deepEqual(Object.keys(record).sort(),['acceptedAt','version']);
 for(const value of ['invalid',JSON.stringify({...record,version:0}),JSON.stringify({...record,acceptedAt:'invalid'})]){await fs.writeFile(file,value);assert.equal((await store.state()).accepted,false);}
});
test('failed persistence cannot authorize opening music',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sona-consent-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'not-a-directory');await fs.writeFile(file,'');const store=new MusicConsentStore(file);
 await assert.rejects(store.accept(MUSIC_CONSENT_VERSION),/saveError/);await assert.rejects(store.requireAccepted(),/required/);
});
