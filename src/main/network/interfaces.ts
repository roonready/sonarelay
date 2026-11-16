import os from 'node:os';
import type { LanInterface } from '../../shared/types';
export function interfaces(): LanInterface[] {
  return Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? []).filter(e => e.family === 'IPv4' && !e.internal && !e.address.startsWith('169.254.'))
      .map(e => ({ name, address: e.address, netmask: e.netmask,
        virtual: /amnezia|vpn|wireguard|wintun|tap|tun|virtual|vethernet|docker|tailscale|zerotier/i.test(name) })))
    .sort((a, b) => Number(a.virtual) - Number(b.virtual) || a.name.localeCompare(b.name));
}
