require('./register-ts.cjs');
const {Discovery}=require('../src/main/discovery/ssdp.ts');
const {Player}=require('../src/main/dlna/player.ts');
const target=process.argv[2];
if(!target)throw new Error('Укажите IP приёмника');
const discovery=new Discovery();
const player=new Player();
const deadline=setTimeout(()=>{discovery.dispose();void player.dispose();process.exitCode=1;},45000);
discovery.on('state',async state=>{
 if(state.scanning)return;
 discovery.dispose();
 try {
  const device=state.devices.find(d=>d.ip===target);
  if(!device)throw new Error('Устройство не обнаружено: '+target);
  console.log('DEVICE',device.name,device.ip);
  const result=await player.command(device,state.selectedAddress,'test');
  console.log('PLAY',JSON.stringify(result));
  if(result.error)throw new Error(result.error);
  await new Promise(resolve=>setTimeout(resolve,2500));
  console.log('STATUS',JSON.stringify(await player.command(device,state.selectedAddress,'status')));
  console.log('HTTP GET requests',player.server.requests);
  await new Promise(resolve=>setTimeout(resolve,6500));
  console.log('END',JSON.stringify(await player.command(device,state.selectedAddress,'status')));
 }catch(error){console.error(error);process.exitCode=1;}
 finally {clearTimeout(deadline);await player.dispose();}
});
void discovery.scan(discovery.state.selectedAddress);
