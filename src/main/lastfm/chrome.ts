import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

export function lastfmChromeProfile(profileDirectory: string, upstream: string) {
 const endpoint = createHash('sha256').update(upstream).digest('hex').slice(0, 24);
 return path.join(profileDirectory, 'chrome-lastfm', endpoint);
}

export async function openLastfmInChrome(url: string, proxy: { server: string; profile?: string }) {
 const target = new URL(url);
 if (target.origin !== 'https://www.last.fm' || target.username || target.password) throw new Error('Invalid Last.fm URL');

 const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA];
 const chrome = await Promise.any(roots.filter((root): root is string => Boolean(root)).map(async root => {
  const executable = path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
  await access(executable, constants.F_OK);
  return executable;
 }));

 const args = ['--new-window'];
 if (proxy.server && proxy.profile) {
  // Chrome reuses an existing browser for each user-data directory.
  args.push(`--user-data-dir=${proxy.profile}`, '--no-first-run', `--proxy-server=${proxy.server}`);
 }
 await new Promise<void>((resolve, reject) => {
  const browser = spawn(chrome, [...args, target.href], { detached: true, stdio: 'ignore' });
  browser.once('error', reject);
  browser.once('spawn', () => { browser.unref(); resolve(); });
 });
}
