import { message as runtimeMessage } from '../../shared/messages';
import { compareReceivers } from '../../shared/receiver-order';
import { SlimBridge } from '../slimproto/server';
import { discoverAirplay2 } from '../airplay2/discovery';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { interfaces, sameSubnet } from '../network/interfaces';
import { neighbors } from '../network/neighbors';
import { parseDevice } from './device-parser';
import { discoverBluos } from '../bluos/discovery';
import { discoverCast } from '../cast/discovery';
import type { DiscoveryState } from '../../shared/types';
const GROUP = '239.255.255.250';
export class Discovery extends EventEmitter {
  state: DiscoveryState = { diagnostics: { replies: 0, descriptions: 0, unicastPeers: 0 }, interfaces: interfaces(), selectedAddress: '', devices: [], scanning: false, error: '', lastScan: null };
  private socket?: dgram.Socket;
  private generation = 0;
  private timer?: NodeJS.Timeout;
  private cycle?: NodeJS.Timeout;
  private pending = new Set<string>();
  private finished = false;
  private seen = new Set<string>();
  private processed = new Set<string>();
  private retries: NodeJS.Timeout[] = [];
  private airplayPending=false;
  private bluosPending=false;
  private bluosScan?: AbortController;
  private castPending=false;
  private stopCast?:()=>void;
  private slim=new SlimBridge();
  private slimPending=false;
  constructor() {
    super();
    this.slim.on('changed',()=>{
      this.state.devices=[...this.state.devices.filter(d=>d.protocol!=='slimproto'),...this.slim.devices].sort(compareReceivers);this.publish();
    });
    this.slim.on('diagnostic',message=>{this.state.diagnostics.slimError=message;this.publish();});
    this.state.selectedAddress = this.state.interfaces.find(i => !i.virtual)?.address ?? '';
    this.cycle = setInterval(() => {
      const current = interfaces();
      const changed = JSON.stringify(current) !== JSON.stringify(this.state.interfaces);
      this.state.interfaces = current;
      if (!current.some(i => i.address === this.state.selectedAddress)) {
        this.cancel(); this.state.devices = []; this.state.scanning = false;
        this.state.selectedAddress = current.find(i => !i.virtual)?.address ?? '';
      }
      this.state.devices = this.state.devices.filter(d => d.expiresAt > Date.now());
      if (this.state.selectedAddress && !this.state.scanning) void this.scan(this.state.selectedAddress, false);
      else if (changed) this.publish();
    }, 30000);
  }
  private publish() { this.emit('state', this.state); }
  private cancel() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.retries.forEach(clearTimeout); this.retries = [];
    this.stopCast?.();this.stopCast=undefined;this.castPending=false;
    this.bluosScan?.abort(); this.bluosScan = undefined;
    this.socket?.close(); this.socket = undefined;
    this.pending.clear(); this.seen.clear(); this.processed.clear(); this.finished = false; this.bluosPending=false;this.airplayPending=false;this.slimPending=false;
  }
  private complete(generation: number) {
    if (generation !== this.generation || !this.finished || this.pending.size || this.bluosPending || this.castPending || this.airplayPending || this.slimPending) return;
    this.socket?.close(); this.socket = undefined;
    this.state.devices = this.state.devices.filter(d => this.seen.has(d.id) || d.expiresAt > Date.now());
    this.state.scanning = false; this.state.lastScan = Date.now(); this.publish();
  }
  async scan(address: string, sweepBluos = true): Promise<DiscoveryState> {
    this.state.interfaces = interfaces();
    const selected = this.state.interfaces.find(i => i.address === address);
    if (!selected) { this.state.error = runtimeMessage('runtime075'); this.publish(); return this.state; }
    this.cancel();
    const generation = this.generation;
    const checkSubnet = sweepBluos || !this.state.lastScan || address !== this.state.selectedAddress;
    if (address !== this.state.selectedAddress) this.state.devices = [];
    const slimAddress=this.state.diagnostics.slimAddress===address?address:undefined;
    const slimError=slimAddress?this.state.diagnostics.slimError:undefined;
    this.state.selectedAddress = address; this.state.scanning = true; this.state.error = '';
    this.state.diagnostics = { replies: 0, descriptions: 0, unicastPeers: 0, bluosDevices:0, castDevices:0, slimAddress, slimError }; this.publish();
    this.slimPending=true;
    void this.slim.start(address,selected.netmask).then(()=>{
      if(generation!==this.generation)return;this.state.diagnostics.slimAddress=address;this.state.diagnostics.slimError='';
      this.state.devices=[...this.state.devices.filter(d=>d.protocol!=='slimproto'),...this.slim.devices].sort(compareReceivers);this.publish();
    }).catch(error=>{if(generation===this.generation){this.state.diagnostics.slimError=error.message;this.publish();}}).finally(()=>{if(generation===this.generation){this.slimPending=false;this.complete(generation);}});
    this.castPending=true;
    void neighbors(address,selected.netmask).then(peers=>{
      if(generation!==this.generation)return;
      const known=this.state.devices.filter(d=>d.protocol==='cast').map(d=>d.ip);
      this.stopCast=discoverCast(address,selected.netmask,[...new Set([...peers,...known])].filter(ip=>sameSubnet(ip,address,selected.netmask)),()=>generation!==this.generation,device=>{
        this.seen.add(device.id);
        this.state.devices=[...this.state.devices.filter(d=>d.id!==device.id),device].sort(compareReceivers);
        this.state.diagnostics.castDevices=this.state.devices.filter(d=>d.protocol==='cast'&&this.seen.has(d.id)).length;
        this.publish();
      },()=>{if(generation===this.generation){this.castPending=false;this.complete(generation);}});
    }).catch(error=>{if(generation===this.generation){this.castPending=false;this.state.error=runtimeMessage('runtime076', {p0: error.message});this.publish();this.complete(generation);}});
    this.airplayPending=true;
    void neighbors(address,selected.netmask).then(async peers=>{
      const known=this.state.devices.filter(d=>d.protocol==='airplay2').map(d=>d.ip);
      const devices=await discoverAirplay2([...new Set([...peers,...known])].filter(ip=>sameSubnet(ip,address,selected.netmask)),address,()=>generation!==this.generation,selected.netmask);
      if(generation!==this.generation)return;
      for(const device of devices){this.seen.add(device.id);this.state.devices=[...this.state.devices.filter(d=>d.id!==device.id),device].sort(compareReceivers);}this.publish();
    }).catch(()=>{}).finally(()=>{if(generation===this.generation){this.airplayPending=false;this.complete(generation);}});
    this.bluosPending=true;
    this.bluosScan = new AbortController();
    const knownBluos = this.state.devices.filter(d => d.protocol === 'bluos').map(d => d.ip);
    const bluosPeers = neighbors(address, selected.netmask).then(peers => [...knownBluos, ...peers], () => knownBluos);
    void discoverBluos(bluosPeers, address, selected.netmask, this.bluosScan.signal, checkSubnet).then(devices=>{
      if(generation!==this.generation)return;
      this.state.diagnostics.bluosDevices=devices.length;
      for(const device of devices){
        this.seen.add(device.id);
        this.state.devices=[...this.state.devices.filter(d=>d.id!==device.id),device].sort(compareReceivers);
      }
      this.publish();
    }).catch(error=>{if(generation===this.generation){this.state.error=runtimeMessage('runtime077', {p0: error.message});this.publish();}})
      .finally(()=>{if(generation===this.generation){this.bluosScan=undefined;this.bluosPending=false;this.complete(generation);}});
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    const fail = (error: Error) => {
      if (generation !== this.generation) return;
      this.state.error = runtimeMessage('runtime078', {p0: error.message});
      this.cancel(); this.state.scanning = false; this.publish();
    };
    socket.on('error', fail);
    socket.on('message', (message, remote) => {
      if (generation !== this.generation || !sameSubnet(remote.address, address, selected.netmask)) return;
      this.state.diagnostics.replies++;
      const lines = message.toString('utf8').split('\r\n');
      if (!/^HTTP\/1\.[01] 200\b/.test(lines[0])) return;
      const headers: Record<string, string> = {};
      for (const line of lines.slice(1)) {
        const colon = line.indexOf(':');
        if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
      }
      if (!headers.location) return;
      const key = headers.location;
      if (this.finished || this.processed.has(key) || this.pending.has(key) || this.pending.size >= 16) return;
      this.pending.add(key);
      void parseDevice(headers, remote.address, address).then(devices => {
        if (generation !== this.generation) return;
        this.processed.add(key); this.state.diagnostics.descriptions++;
        for (const device of devices) {
          this.seen.add(device.id);
          this.state.devices = [...this.state.devices.filter(d => d.id !== device.id), device].sort(compareReceivers);
        }
        this.publish();
      }).catch(error => {
        if (generation === this.generation) {
          this.state.error = runtimeMessage('runtime079', {p0: remote.address, p1: error.message}); this.publish();
        }
      }).finally(() => {
        if (generation === this.generation) { this.pending.delete(key); this.complete(generation); }
      });
    });
    socket.bind(0, address, () => {
      if (generation !== this.generation) return;
      try {
        socket.setMulticastInterface(address); socket.setMulticastTTL(2);
        const send = (host: string, target: string) => {
          if (generation !== this.generation || this.finished) return;
          const request = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${GROUP}:1900\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: ${target}\r\n\r\n`);
          socket.send(request, 1900, host, error => { if (error && generation === this.generation) fail(error); });
        };
        const search = (hosts: string[]) => {
          for (const host of hosts) for (const target of ['ssdp:all', 'urn:schemas-upnp-org:device:MediaRenderer:1']) send(host, target);
        };
        search([GROUP]);
        this.retries.push(setTimeout(() => search([GROUP]), 1500));
        void neighbors(address, selected.netmask).then(peers => {
          if (generation !== this.generation || this.finished) return;
          this.state.diagnostics.unicastPeers = peers.length; this.publish();
          search(peers);
          this.retries.push(setTimeout(() => search(peers), 1500));
        }).catch(error => {
          if (generation === this.generation) { this.state.error = runtimeMessage('runtime080', {p0: error.message}); this.publish(); }
        });
        this.timer = setTimeout(() => { this.finished = true; this.complete(generation); }, 10000);
      } catch (error) { fail(error as Error); }
    });
    return this.state;
  }
  async dispose() { if (this.cycle) clearInterval(this.cycle); this.cancel(); await this.slim.stop(); }
}

