import { message as runtimeMessage } from '../../shared/messages';
﻿import http from 'node:http';
import { XMLParser } from 'fast-xml-parser';
import type { DlnaService } from '../../shared/types';
export const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
export async function soap(service: DlnaService, action: string, values: Record<string, string | number>, address: string): Promise<any> {
  if (!service.actions.includes(action)) throw new Error(runtimeMessage('runtime089', {p0: action}));
  const url = new URL(service.controlUrl);
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${escapeXml(service.type)}">${Object.entries(values).map(([key,value]) => `<${key}>${escapeXml(String(value))}</${key}>`).join('')}</u:${action}></s:Body></s:Envelope>`;
  return new Promise((resolve,reject) => {
    const request = http.request(url, { method:'POST', localAddress:address, timeout:6000,
      headers:{ 'Content-Type':'text/xml; charset="utf-8"', SOAPAction:`"${service.type}#${action}"`, 'Content-Length':Buffer.byteLength(body) } }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data',(chunk: Buffer) => { size += chunk.length; if(size>1024*1024) request.destroy(new Error(runtimeMessage('runtime090'))); else chunks.push(chunk); });
      response.on('error',reject);
      response.on('end',() => {
        try {
          const xml = new XMLParser({removeNSPrefix:true}).parse(Buffer.concat(chunks).toString('utf8'));
          const payload = xml.Envelope?.Body;
          if(response.statusCode !== 200 || payload?.Fault) {
            const fault = payload?.Fault?.detail?.UPnPError;
            throw new Error(`${action}: ${fault?.errorDescription ?? payload?.Fault?.faultstring ?? `HTTP ${response.statusCode}`} (${fault?.errorCode ?? ''})`);
          }
          resolve(payload?.[`${action}Response`] ?? {});
        } catch(error) { reject(error); }
      });
    });
    request.on('timeout',()=>request.destroy(new Error(runtimeMessage('runtime091', {p0: action}))));
    request.on('error',reject); request.end(body);
  });
}
