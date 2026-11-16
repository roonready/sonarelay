require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {configureProfile}=require('../src/main/runtime/profile.ts');
function fixture({packaged=false,custom=false,lock=true}={}){
 const paths={appData:path.resolve('profile-fixture'),userData:path.resolve('custom-profile')},created=[];let lockProfile;
 const app={isPackaged:packaged,getPath:key=>paths[key],setPath:(key,value)=>{paths[key]=value;},commandLine:{hasSwitch:()=>custom},requestSingleInstanceLock:()=>{lockProfile=paths.userData;return lock;}};
 const result=configureProfile(app,directory=>created.push(directory));
 return {result,paths,created,lockProfile};
}
test('development and installed apps use separate Chromium and singleton profiles',()=>{
 const development=fixture(),installed=fixture({packaged:true});
 assert.notEqual(development.paths.userData,installed.paths.userData);
 for(const app of [development,installed]){assert.equal(app.paths.userData,app.paths.sessionData);assert.equal(app.lockProfile,app.paths.userData);assert.deepEqual(app.created,[app.paths.userData]);}
 assert.equal(development.result.credentialsFallback,installed.paths.userData);
 assert.equal(installed.result.credentialsFallback,undefined);
});
test('explicit test or portable user-data-dir is preserved and never reads production Last.fm keys',()=>{
 const f=fixture({custom:true});assert.equal(f.paths.userData,path.resolve('custom-profile'));assert.equal(f.paths.sessionData,f.paths.userData);assert.equal(f.result.credentialsFallback,undefined);
});
test('a second instance is rejected before opening any application window',()=>{
 assert.equal(fixture({lock:false}).result.ownsInstance,false);
 assert.equal(fixture({lock:true}).result.ownsInstance,true);
});
