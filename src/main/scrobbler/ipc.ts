import { app, ipcMain, safeStorage, type WebContents } from 'electron';
import path from 'node:path';
import type { ScrobblerSettings } from '../../shared/types';
import { ScrobblerService } from './service';
import { NowPlayingReporter } from './now-playing';

export function registerScrobbler(ui: WebContents) {
  const service = new ScrobblerService(path.join(app.getPath('userData'), 'audio-scrobbler.json'), {
    async encrypt(value) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure storage unavailable');
      return (await safeStorage.encryptStringAsync(value)).toString('base64');
    },
    async decrypt(value) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure storage unavailable');
      return (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result;
    },
  }, state => { if (!ui.isDestroyed()) ui.send('scrobbler:state', state); }, fetch, new NowPlayingReporter());

  ipcMain.handle('scrobbler:get', async event => {
    if (event.sender !== ui) throw new Error('Forbidden');
    await service.ready;
    return service.snapshot();
  });
  ipcMain.handle('scrobbler:save', async (event, input: ScrobblerSettings) => {
    if (event.sender !== ui) throw new Error('Forbidden');
    if (!input || typeof input.url !== 'string' || input.url.length > 2048 || typeof input.enabled !== 'boolean' ||
        (input.token !== undefined && (typeof input.token !== 'string' || input.token.length > 128)) ||
        (input.transferQueue !== undefined && typeof input.transferQueue !== 'boolean')) {
      throw new Error('Invalid settings');
    }
    return service.configure(input);
  });

  return {
    consume: service.consume.bind(service),
    dispose: () => {
      ipcMain.removeHandler('scrobbler:get');
      ipcMain.removeHandler('scrobbler:save');
      return service.dispose();
    },
  };
}
