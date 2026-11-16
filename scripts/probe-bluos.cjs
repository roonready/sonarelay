require('./register-ts.cjs');
const {interfaces}=require('../src/main/network/interfaces.ts');
const {neighbors}=require('../src/main/network/neighbors.ts');
const http=require('node:http');
(async()=>{
 const lan=interfaces().find(i=>!i.virtual);if(!lan)throw new Error('LAN отсутствует');
 const peers=process.argv[2]?[process.argv[2]]:await neighbors(lan.address,lan.netmask);
 await Promise.all(peers.map(ip=>new Promise(resolve=>{
  const request=http.get({host:ip,port:11000,path:'/SyncStatus',localAddress:lan.address,timeout:2000},response=>{
   let body='';response.on('data',chunk=>{body+=chunk;if(body.length>100000)request.destroy();});response.on('end',()=>{console.log(ip,response.statusCode,body.slice(0,12000));resolve();});response.on('error',()=>resolve());
  });request.on('timeout',()=>request.destroy());request.on('error',()=>resolve());
 })));
})();
