require('./register-ts.cjs');
const {interfaces}=require('../src/main/network/interfaces.ts');
const {probeCast}=require('../src/main/cast/probe.ts');
const ip=process.argv[2];if(!ip)throw new Error('Укажите IP Google Cast');
const lan=interfaces().find(i=>!i.virtual);if(!lan)throw new Error('Нет LAN');
probeCast(ip,lan.address).then(device=>console.log(JSON.stringify(device,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
