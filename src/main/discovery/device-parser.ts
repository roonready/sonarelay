import { message as runtimeMessage } from '../../shared/messages';
﻿import http from 'node:http';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { RendererDevice, DlnaService } from '../../shared/types';
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const str = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function getXml(url: URL, localAddress: string): Promise<any> {
  if (url.protocol !== 'http:' || !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return Promise.reject(new Error(runtimeMessage('runtime069')));
  return new Promise((resolve, reject) => {
    const request = http.get(url, { localAddress, timeout: 4000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) request.destroy(new Error(runtimeMessage('runtime070')));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const xml = Buffer.concat(chunks).toString('utf8');
          if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error(runtimeMessage('runtime071'));
          resolve(parser.parse(xml));
        } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error(runtimeMessage('runtime072'))));
    request.on('error', reject);
  });
}
function devices(root: any): any[] {
  return [root, ...list(root?.deviceList?.device).flatMap(devices)];
}
export async function parseDevice(headers: Record<string, string>, remoteIp: string, address: string): Promise<RendererDevice[]> {
  const location = new URL(headers.location);
  if (location.hostname !== remoteIp) throw new Error(runtimeMessage('runtime073'));
  const xml = await getXml(location, address);
  const base = xml.root?.URLBase ? new URL(str(xml.root.URLBase), location) : location;
  if (base.hostname !== remoteIp) throw new Error(runtimeMessage('runtime074'));
  const results: RendererDevice[] = [];
  for (const device of devices(xml.root?.device)) {
    if (!/^urn:schemas-upnp-org:device:MediaRenderer:\d+$/.test(str(device?.deviceType))) continue;
    const services: DlnaService[] = [];
    for (const service of list<any>(device?.serviceList?.service)) {
      if (!/^urn:schemas-upnp-org:service:(AVTransport|RenderingControl):\d+$/.test(str(service.serviceType))) continue;
      const control = new URL(str(service.controlURL), base);
      const scpd = new URL(str(service.SCPDURL), base);
      if (control.hostname !== remoteIp || scpd.hostname !== remoteIp || control.protocol !== 'http:') continue;
      try {
        const definition = await getXml(scpd, address);
        const actions = list<any>(definition.scpd?.actionList?.action).map(a => str(a.name)).filter(Boolean);
        if (actions.length) services.push({ type: str(service.serviceType), controlUrl: control.href, scpdUrl: scpd.href, actions });
      } catch { /* A renderer is accepted only with a reachable AVTransport definition. */ }
    }
    if (!services.some(s => s.type.includes(':AVTransport:') && s.actions.includes('SetAVTransportURI') && s.actions.includes('Play'))) continue;
    const ttl = Math.min(1800, Math.max(30, Number(headers['cache-control']?.match(/max-age\s*=\s*(\d+)/i)?.[1] ?? 180)));
    results.push({ id: str(device.UDN) || headers.usn, name: str(device.friendlyName) || remoteIp,
      manufacturer: str(device.manufacturer), model: str(device.modelName), ip: remoteIp,
      location: location.href, usn: headers.usn ?? '', st: headers.st ?? '', server: headers.server ?? '',
      services, expiresAt: Date.now() + ttl * 1000, status: 'available' });
  }
  return results;
}
