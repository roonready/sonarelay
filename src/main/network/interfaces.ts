import os from 'node:os';
import type { LanInterface } from '../../shared/types';
export function sameSubnet(ip: string, address: string, mask: string) {
  const parts = ip.split('.').map(Number), local = address.split('.').map(Number), bits = mask.split('.').map(Number);
  return parts.length === 4 && parts.every((p, i) => (p & bits[i]) === (local[i] & bits[i]));
}

export function interfaces(): LanInterface[] {
  return Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? []).filter(e => e.family === 'IPv4' && !e.internal && !e.address.startsWith('169.254.'))
      .map(e => ({ name, address: e.address, netmask: e.netmask,
        virtual: /amnezia|vpn|wireguard|wintun|tap|tun|virtual|vethernet|docker|tailscale|zerotier/i.test(name) })))
    .sort((a, b) => Number(a.virtual) - Number(b.virtual) || a.name.localeCompare(b.name));
}
