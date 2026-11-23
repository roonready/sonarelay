import { message as runtimeMessage } from '../../shared/messages';
import { isIPv4 } from 'node:net';
import multicastDns from 'multicast-dns';
import type { Answer } from 'dns-packet';
import type { RendererDevice } from '../../shared/types';
import { sameSubnet } from '../network/interfaces';
import { bluosRequest } from './client';
import { browseLsdp } from './lsdp';
export async function probeBluos(ip:string,address:string,port=11000,timeout=1500):Promise<RendererDevice>{
 const result=await bluosRequest(ip,port,address,'SyncStatus',{},timeout);
 const sync=result.SyncStatus;
 if(!sync||!sync['@_name']||!sync['@_modelName']||!sync['@_mac'])throw new Error(runtimeMessage('runtime056'));
 if(sync['@_initialized']==='false')throw new Error(runtimeMessage('runtime057'));
 const capabilities=['Play','Pause','Stop','GetTransportInfo','GetPositionInfo','GetVolume'];
 if(Number(sync['@_volume'])>=0)capabilities.push('SetVolume');
 return {id:`bluos:${String(sync['@_mac']).toLowerCase()}:${port}`,protocol:'bluos',apiPort:port,
  name:String(sync['@_name']),manufacturer:String(sync['@_brand']??'BluOS'),model:String(sync['@_modelName']),ip,
  location:`http://${ip}:${port}/SyncStatus`,services:[],capabilities,usn:'',st:'',server:'BluOS HTTP API',expiresAt:Date.now()+90000,status:'available'};
}
const services = ['_musc._tcp.local', '_musp._tcp.local'];
const dnsName = (name: string) => name.toLowerCase().replace(/\.$/, '');
const isBluosInstance = (name: string) => services.some(service => dnsName(name).endsWith(`.${service}`));

export function bluosAdvertisements(records: Answer[], address: string, netmask: string) {
 const addresses = records.filter(record => record.type === 'A' && isIPv4(record.data)
   && sameSubnet(record.data, address, netmask));
 return records.flatMap(record => {
  if (record.type !== 'SRV' || !isBluosInstance(record.name)) return [];
  const { target, port } = record.data;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  return addresses.flatMap(entry => entry.type === 'A' && dnsName(entry.name) === dnsName(target)
    ? [{ ip: entry.data, port }] : []);
 });
}

async function browseBluos(address: string, netmask: string, signal: AbortSignal) {
 const records = new Map<string, Answer>();
 if (signal.aborted) return [];
 await new Promise<void>(resolve => {
  const mdns = multicastDns({ interface: address, bind: '0.0.0.0', reuseAddr: true });
  const requested = new Set<string>();
  function resolveRecord(name: string, type: 'A' | 'SRV') {
   const key = `${type}:${dnsName(name)}`;
   if (requested.size >= 128 || requested.has(key)) return;
   requested.add(key);
   mdns.query(name, type);
  }
  const query = () => mdns.query(services.map(name => ({ name, type: 'PTR' })));
  const retry = setTimeout(query, 1200);
  const deadline = setTimeout(finish, 3000);
  function finish() {
   clearTimeout(retry);
   clearTimeout(deadline);
   signal.removeEventListener('abort', finish);
   try { mdns.destroy(); } catch { /* The socket may already be closed. */ }
   resolve();
  }
  signal.addEventListener('abort', finish, { once: true });
  mdns.on('ready', query);
  mdns.on('error', finish);
  mdns.on('response', packet => {
   const received = [...packet.answers, ...packet.additionals];
   for (const record of received) {
    if (record.type !== 'A' && record.type !== 'SRV') continue;
    const key = `${record.type}:${dnsName(record.name)}${record.type === 'A' ? `:${record.data}` : ''}`;
    if (record.ttl === 0) records.delete(key);
    else if (records.size < 512 || records.has(key)) records.set(key, record);
   }
   for (const record of received) {
    if (record.type !== 'PTR' && record.type !== 'SRV') continue;
    if (record.ttl === 0) continue;
    if (record.type === 'PTR' && services.includes(dnsName(record.name)) && isBluosInstance(record.data)
        && !records.has(`SRV:${dnsName(record.data)}`)) resolveRecord(record.data, 'SRV');
    if (record.type === 'SRV' && isBluosInstance(record.name)
        && ![...records.values()].some(entry => entry.type === 'A' && dnsName(entry.name) === dnsName(record.data.target))) {
     resolveRecord(record.data.target, 'A');
    }
   }
  });
 });
 return bluosAdvertisements([...records.values()], address, netmask);
}

export async function discoverBluos(
 peers: Promise<string[]>, address: string, netmask: string, signal: AbortSignal, sweep = false
): Promise<RendererDevice[]> {
 const devices = new Map<string, RendererDevice>();
 const probed = new Set<string>();
 async function probe(targets: { ip: string; port: number }[], concurrency = 8, timeout = 1500) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
   while (index < targets.length && !signal.aborted) {
    const { ip, port } = targets[index++];
    const key = `${ip}:${port}`;
    if (probed.has(key)) continue;
    probed.add(key);
    try {
     const device = await probeBluos(ip, address, port, timeout);
     if (!signal.aborted) devices.set(device.id, device);
    } catch { /* Only confirmed BluOS responses are devices. */ }
   }
  }));
 }
 await Promise.all([
  browseBluos(address, netmask, signal).catch(() => []).then(probe),
  browseLsdp(address, netmask, signal).catch(() => []).then(probe),
  peers.catch(() => []).then(async ips => {
   const known = new Set<string>(ips);
   const cached = probe([...known].filter(ip => sameSubnet(ip, address, netmask))
     .map(ip => ({ ip, port: 11000 })));
   if (!sweep || netmask !== '255.255.255.0') return cached;
   const prefix = address.slice(0, address.lastIndexOf('.') + 1);
   const targets = Array.from({ length: 254 }, (_, i) => ({ ip: `${prefix}${i + 1}`, port: 11000 }))
     .filter(target => target.ip !== address && !known.has(target.ip));
   await Promise.all([cached, probe(targets, 32, 900)]);
  })
 ]);
 return [...devices.values()];
}
