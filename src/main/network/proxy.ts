import { app, ipcMain, net, safeStorage, session, type AuthInfo, type WebContents } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProxySettings, ProxySettingsInput } from '../../shared/types';
import { parseProxyInput } from '../../shared/proxy-format';
import { createLastfmTransport, lastfmTransport } from '../lastfm/client';
import { startLastfmBrowserProxy } from '../lastfm/browser-proxy';
import { lastfmChromeProfile } from '../lastfm/chrome';

async function openBrowserTunnel(config: ProxySettingsInput, profile: string) {
 const portFile = path.join(profile, 'sonarelay-proxy-port');
 let port = 0;
 try {
  port = Number(await fs.readFile(portFile, 'utf8'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid browser proxy port');
 } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
 }
 const tunnel = await startLastfmBrowserProxy(config, port);
 try {
  if (!port) {
   await fs.mkdir(profile, { recursive: true });
   await fs.writeFile(portFile, String(tunnel.port), { mode: 0o600 });
  }
  return tunnel;
 } catch (error) {
  await tunnel.close();
  throw error;
 }
}

function validate(input: ProxySettingsInput): ProxySettingsInput {
 if (!input || typeof input.server !== 'string' || input.server.length > 2048 || typeof input.username !== 'string'
     || typeof input.password !== 'string' || input.password.length > 1024 || input.username.length > 256) throw new Error();
 if (!input.server.trim()) return { server: '', username: '', password: '' };
 const url = new URL(input.server.trim());
 if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || !url.hostname || /[;,=]/.test(url.host) || url.username || url.password
     || (url.pathname && url.pathname !== '/') || url.search || url.hash
     || (url.protocol === 'socks5:' && (input.username || input.password)) || (input.password && !input.username)) throw new Error();
 return { server: `${url.protocol}//${url.host}`, username: input.username, password: input.password };
}

export function registerProxy(ui: WebContents) {
 const file = path.join(app.getPath('userData'), 'proxy-settings.bin');
 const lastfm = session.fromPartition('sonarelay-lastfm', { cache: false });
 let settings: ProxySettingsInput = { server: '', username: '', password: '' };
 let loadError = false;
 let disposed = false;
 let browserTunnel: Promise<Awaited<ReturnType<typeof startLastfmBrowserProxy>>> | undefined;
 function closeBrowserTunnel() {
  const closing = browserTunnel?.then(tunnel => tunnel.close(), () => {});
  browserTunnel = undefined;
  return closing;
 }
 const snapshot = (): ProxySettings => ({ server: settings.server, username: settings.username,
  hasPassword: Boolean(settings.password), loadError });
 const login = (info: AuthInfo, callback: (username?: string, password?: string) => void) => {
  if (info.isProxy && settings.server && settings.username) {
   const url = new URL(settings.server);
   const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
   if (info.host.toLowerCase() === url.hostname.replace(/^\[|\]$/g, '') && info.port === port) {
    callback(settings.username, settings.password);
    return;
   }
  }
  callback();
 };
 async function apply(config: ProxySettingsInput) {
  await lastfm.setProxy(config.server ? { mode: 'fixed_servers', proxyRules: config.server } : { mode: 'system' });
  await lastfm.clearAuthCache();
  await lastfm.closeAllConnections();
 }

 const ready = (async () => {
  try {
   const data = await fs.readFile(file);
   if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error();
   const stored = JSON.parse((await safeStorage.decryptStringAsync(data)).result);
   settings = validate(stored);
   await apply(settings);
  } catch (error) {
   if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
   settings = { server: '', username: '', password: '' };
   loadError = true;
   await apply(settings).catch(() => {});
  }
 })();
 let queue = ready;
 ipcMain.handle('proxy:get', async event => {
  if (disposed || event.sender !== ui) throw new Error('Forbidden');
  await queue;
  return snapshot();
 });
 ipcMain.handle('proxy:save', async (event, input: string) => {
  if (disposed || event.sender !== ui) throw new Error('Forbidden');
  const save = queue.then(async () => {
   const next = validate(parseProxyInput(input));
   if (!next.password && next.server === settings.server && next.username === settings.username) next.password = settings.password;
   const previous = settings;
   if (next.server && !await safeStorage.isAsyncEncryptionAvailable()) throw new Error();
   const encrypted = next.server ? await safeStorage.encryptStringAsync(JSON.stringify(next)) : undefined;
   settings = next;
   try {
    await apply(next);
    if (encrypted) {
     try {
      await fs.writeFile(file + '.tmp', encrypted, { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
     } finally { await fs.rm(file + '.tmp', { force: true }).catch(() => {}); }
    } else await fs.rm(file, { force: true });
    if (next.server !== previous.server || next.username !== previous.username || next.password !== previous.password) await closeBrowserTunnel();
    loadError = false;
   } catch (error) {
    settings = previous;
    await apply(previous).catch(() => {});
    throw error;
   }
   return snapshot();
  });
  queue = save.then(() => {}, () => {});
  return save;
 });

 const viaProxy = createLastfmTransport((url, options, response) => {
  const request = net.request({ ...options, url: url.href, session: lastfm, redirect: 'error' });
  request.once('login', login);
  request.on('response', response);
  return request;
 });
 return {
  browserProxy: async () => {
   await queue;
   if (disposed) throw new Error('Proxy is unavailable');
   if (!settings.server) return { server: '' };
   const profileKey = settings.username ? `authenticated:${settings.server}` : settings.server;
   const profile = lastfmChromeProfile(app.getPath('userData'), profileKey);
   if (!settings.username) return { server: settings.server, profile };
   const pending = browserTunnel ??= openBrowserTunnel(settings, profile);
   try { return { server: (await pending).server, profile }; }
   catch (error) {
    if (browserTunnel === pending) browserTunnel = undefined;
    throw error;
   }
  },
  transport: (async (...args: Parameters<typeof lastfmTransport>) => {
   await queue;
   return (settings.server ? viaProxy : lastfmTransport)(...args);
  }),
  dispose: () => {
   disposed = true;
   ipcMain.removeHandler('proxy:get');
   ipcMain.removeHandler('proxy:save');
   return closeBrowserTunnel();
  },
 };
}
