import fs from 'node:fs';
import path from 'node:path';
import type { App } from 'electron';

type ProfileApp = Pick<App, 'isPackaged' | 'getPath' | 'setPath' | 'commandLine' | 'requestSingleInstanceLock'>;

/** Configure before app.ready, before creating any Chromium session. */
export function configureProfile(app: ProfileApp, mkdir = (directory: string) => fs.mkdirSync(directory, { recursive: true })) {
  const installedProfile = path.join(app.getPath('appData'), 'sonarelay');
  const custom = app.commandLine.hasSwitch('user-data-dir');
  const profile = custom ? app.getPath('userData') : app.isPackaged ? installedProfile : path.join(app.getPath('appData'), 'sonarelay-dev');
  mkdir(profile);
  app.setPath('userData', profile);
  // setPath(userData) alone must not leave sessionData pointing at an earlier default.
  app.setPath('sessionData', profile);
  if (process.platform === 'win32' && !app.isPackaged) {
    // A dev restart can overlap with Chromium's previous cache handles on Windows.
    app.commandLine.appendSwitch('disable-http-cache');
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  }
  return {
    ownsInstance: app.requestSingleInstanceLock(),
    credentialsFallback: !custom && !app.isPackaged ? installedProfile : undefined,
  };
}
