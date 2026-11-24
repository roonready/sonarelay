import type { ProxySettings, ProxySettingsInput } from './types';

export function parseProxyInput(value: string): ProxySettingsInput {
 if (typeof value !== 'string' || value.length > 3400) throw new Error('Invalid proxy format');
 if (!value.trim()) return { server: '', username: '', password: '' };
 const match = /^(?:(https?|socks5):\/\/)?(\[[0-9a-f:.]+\]|[^:\s/?#@;,=[\]]+):(\d{1,5})(?::([^:\r\n]*)(?::([^\r\n]*))?)?$/i
  .exec(value.trimStart().replace(/[\r\n]+$/, ''));
 if (!match) throw new Error('Invalid proxy format');
 const [, scheme = 'http', host, port, username = '', password = ''] = match;
 if (Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid proxy port');
 return { server: `${scheme.toLowerCase()}://${host}:${port}`, username, password };
}

export function formatSavedProxy(settings: ProxySettings): string {
 if (!settings.server) return '';
 const url = new URL(settings.server);
 const scheme = url.protocol === 'http:' ? '' : `${url.protocol}//`;
 const port = url.port || ({ 'http:': '80', 'https:': '443', 'socks5:': '1080' }[url.protocol]);
 const credentials = settings.username ? `:${settings.username}` : '';
 return `${scheme}${url.hostname}:${port}${credentials}`;
}
