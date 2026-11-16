import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export function parseNeighbors(output: string, address: string, netmask: string): string[] {
  const local = address.split('.').map(Number), mask = netmask.split('.').map(Number);
  const candidates = [...output.matchAll(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([\da-f]{2}(?:-[\da-f]{2}){5})\s+/gmi)];
  return [...new Set(candidates.filter(match => {
    const ip = match[1].split('.').map(Number);
    return match[1] !== address && ip[0] > 0 && ip[0] < 224 && match[2].toLowerCase() !== 'ff-ff-ff-ff-ff-ff'
      && ip.every((value, index) => (value & mask[index]) === (local[index] & mask[index]));
  }).map(match => match[1]))].slice(0, 64);
}
export async function neighbors(address: string, netmask: string): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const { stdout } = await execute('arp.exe', ['-a', '-N', address], { timeout: 2500, windowsHide: true });
  return parseNeighbors(stdout, address, netmask);
}
