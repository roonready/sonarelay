import http from 'node:http';
import https from 'node:https';
import { isIP, type Socket } from 'node:net';
import type { ProxySettingsInput } from '../../shared/types';

export async function startLastfmBrowserProxy(settings: ProxySettingsInput, port = 0) {
 const upstream = new URL(settings.server);
 const proxyRequest = upstream.protocol === 'https:' ? https.request : http.request;
 const authorization = 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
 const clients = new Set<Socket>();
 const server = http.createServer((_request, response) => {
  response.writeHead(403).end();
 });
 server.on('connection', socket => {
  clients.add(socket);
  socket.once('close', () => clients.delete(socket));
  socket.on('error', () => socket.destroy());
 });
 server.on('connect', (request, client, initial) => {
  const target = request.url ?? '';
  const authority = /^(\[[a-f0-9:.]+\]|[a-z0-9.-]+):443$/i.exec(target);
  if (!authority || (authority[1].startsWith('[') && isIP(authority[1].slice(1, -1)) !== 6)) {
   client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
   return;
  }
  const failed = () => client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  const tunnel = proxyRequest(upstream, {
   method: 'CONNECT', path: target, agent: false,
   headers: { Host: target, 'Proxy-Authorization': authorization },
  });
  tunnel.setTimeout(10000, () => tunnel.destroy());
  tunnel.once('error', failed);
  client.once('close', () => tunnel.destroy());
  tunnel.once('connect', (response, socket, head) => {
   if (response.statusCode !== 200 || client.destroyed) {
    socket.destroy();
    if (!client.destroyed) failed();
    return;
   }
   socket.setTimeout(0);
   socket.on('error', () => client.destroy());
   socket.once('close', () => client.destroy());
   client.once('close', () => socket.destroy());
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if (head.length) client.write(head);
   if (initial.length) socket.write(initial);
   client.pipe(socket);
   socket.pipe(client);
  });
  tunnel.end();
 });

 await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
 });
 const address = server.address();
 if (!address || typeof address === 'string') { server.close(); throw new Error('Proxy is unavailable'); }
 return {
  server: `http://127.0.0.1:${address.port}`,
  port: address.port,
  close: () => new Promise<void>(resolve => {
   server.close(() => resolve());
   for (const socket of clients) socket.destroy();
  }),
 };
}
