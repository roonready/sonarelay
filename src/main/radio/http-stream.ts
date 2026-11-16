import http, { type ClientRequest, type IncomingMessage } from 'node:http';
import https from 'node:https';

export class RadioHttpStream {
  private request?: ClientRequest;
  private response?: IncomingMessage;
  private reject?: (error: Error) => void;
  private stopped = false;
  constructor(private timeout = 15000) {}
  open(address: string): Promise<IncomingMessage> {
    if (this.request || this.stopped) return Promise.reject(new Error('radio.cancelled'));
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const connect = (raw: string, redirects: number) => {
        if (this.stopped) { reject(new Error('radio.cancelled')); return; }
        let url: URL;
        try { url = new URL(raw); } catch { reject(new Error('radio.invalidStream')); return; }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) { reject(new Error('radio.invalidStream')); return; }
        const request = (url.protocol === 'https:' ? https : http).get(url, {
          headers: { 'Icy-MetaData': '1', 'User-Agent': 'SonaRelay', Accept: 'audio/*', 'Accept-Encoding': 'identity' },
        }, response => {
          if (this.stopped) { response.destroy(); return; }
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = response.headers.location;
            response.destroy();
            if (!location || redirects >= 5) { reject(new Error('radio.redirectError')); return; }
            try { connect(new URL(location, url).href, redirects + 1); } catch { reject(new Error('radio.redirectError')); }
            return;
          }
          if (status !== 200) { response.destroy(); reject(new Error('radio.connectionError')); return; }
          this.response = response; this.reject = undefined; resolve(response);
        });
        this.request = request;
        request.setTimeout(this.timeout, () => request.destroy(new Error('radio.timeout')));
        request.on('error', error => { if (this.request === request) reject(error); });
      };
      connect(address, 0);
    });
  }
  stop() {
    this.stopped = true;
    this.reject?.(new Error('radio.cancelled')); this.reject = undefined;
    this.response?.destroy(); this.request?.destroy(); this.response = undefined; this.request = undefined;
  }
}
