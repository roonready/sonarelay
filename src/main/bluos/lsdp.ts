import { createSocket } from 'node:dgram';
import { sameSubnet } from '../network/interfaces';

const port = 11430;
const query = Buffer.from([6, 76, 83, 68, 80, 1, 7, 82, 2, 0, 1, 0, 3]);
type Player = { ip: string; port: number };

export function lsdpPlayers(packet: Buffer) {
 const players: Player[] = [];
 const header = packet[0];
 if (header < 6 || header > packet.length || packet.toString('ascii', 1, 5) !== 'LSDP' || packet[5] !== 1) return players;
 for (let start = header; start < packet.length;) {
  const length = packet[start];
  const end = start + length;
  if (length < 2 || end > packet.length) break;
  if (packet[start + 1] === 0x41) {
   let offset = start + 3 + packet[start + 2];
   if (offset + 6 <= end && packet[offset++] === 4) {
    const ip = [...packet.subarray(offset, offset + 4)].join('.');
    offset += 4;
    const count = packet[offset++];
    for (let i = 0; i < count && offset + 3 <= end; i++) {
     const type = packet.readUInt16BE(offset);
     offset += 2;
     const fields = packet[offset++];
     let apiPort: number | undefined;
     let complete = true;
     for (let j = 0; j < fields; j++) {
      if (offset >= end) { complete = false; break; }
      const keyEnd = offset + 1 + packet[offset];
      const valueEnd = keyEnd < end ? keyEnd + 1 + packet[keyEnd] : end + 1;
      if (valueEnd > end) {
       complete = false;
       offset = end;
       break;
      }
      if (packet.toString('ascii', offset + 1, keyEnd) === 'port') {
       apiPort = Number(packet.toString('ascii', keyEnd + 1, valueEnd));
      }
      offset = valueEnd;
     }
     if (complete && (type === 1 || type === 3)) {
      const candidate = apiPort ?? (type === 1 ? 11000 : 0);
      if (Number.isInteger(candidate) && candidate > 0 && candidate <= 65535) players.push({ ip, port: candidate });
     }
    }
   }
  }
  start = end;
 }
 return players;
}

export function browseLsdp(address: string, netmask: string, signal: AbortSignal) {
 const players = new Map<string, Player>();
 return new Promise<Player[]>(resolve => {
  if (signal.aborted) return resolve([]);
  const socket = createSocket('udp4');
  const mask = netmask.split('.').map(Number);
  const broadcast = address.split('.').map((part, i) => Number(part) | (255 ^ mask[i])).join('.');
  let retry: NodeJS.Timeout | undefined;
  const deadline = setTimeout(finish, 2600);
  function finish() {
   clearTimeout(deadline);
   clearTimeout(retry);
   signal.removeEventListener('abort', finish);
   try { socket.close(); } catch { /* The socket may already be closed. */ }
   resolve([...players.values()]);
  }
  signal.addEventListener('abort', finish, { once: true });
  socket.on('error', finish);
  socket.on('message', (packet, remote) => {
   if (!sameSubnet(remote.address, address, netmask)) return;
   for (const player of lsdpPlayers(packet)) {
    if (players.size < 64 && player.ip === remote.address) players.set(`${player.ip}:${player.port}`, player);
   }
  });
  socket.bind(0, address, () => {
   try {
    socket.setBroadcast(true);
    const send = () => socket.send(query, port, broadcast, error => { if (error) finish(); });
    send();
    retry = setTimeout(send, 1000);
   } catch { finish(); }
  });
 });
}
