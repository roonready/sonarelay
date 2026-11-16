// Electron does not expose OpenSSL's chacha20-poly1305 cipher. Keep the wire
// protocol unchanged, using noble for both HAP control frames and RTP audio.
// Scoped to this pinned dependency: never modify the global node:crypto API.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(path.dirname(require.resolve('@sonn-audio/node-airplay')),'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='0.1.3')throw new Error('Review AirPlay crypto patch for version '+version);
function patch(file,transform){const target=path.join(root,'dist',file),original=fs.readFileSync(target,'utf8');if(original.includes("from '@noble/ciphers/chacha.js'")){if(/create(?:Cipheriv|Decipheriv)\('chacha20-poly1305'/.test(original))throw new Error('Incomplete AirPlay crypto patch');return;}const updated=transform(original);if(updated===original||/create(?:De)?cipheriv\('chacha20-poly1305'/.test(updated)||updated.includes("createCipheriv('chacha20-poly1305'"))throw new Error('AirPlay crypto patch mismatch: '+file);fs.writeFileSync(target,updated);}
patch('hap.js',s=>s.replace("import { createCipheriv, createDecipheriv, hkdfSync, timingSafeEqual } from 'node:crypto';","import { hkdfSync, timingSafeEqual } from 'node:crypto';\nimport { chacha20poly1305 } from '@noble/ciphers/chacha.js';").replace(/            const cipher = createCipheriv\('chacha20-poly1305',[\s\S]*?frames.push\(lengthField, body, Buffer.from\(cipher.getAuthTag\(\)\)\);/,`            const encrypted = chacha20poly1305(this.writeKey, makeNonce(this.writeCounter++), lengthField).encrypt(chunk);
            frames.push(lengthField, Buffer.from(encrypted));`).replace(/            const decipher = createDecipheriv\('chacha20-poly1305',[\s\S]*?decipher.final\(\);[^\n]*/,`            const decrypted = chacha20poly1305(this.readKey, makeNonce(this.readCounter++), lengthField).decrypt(Buffer.concat([body, tag]));
            out.push(Buffer.from(decrypted));`));
patch('stream.js',s=>s.replace("import { createCipheriv } from 'node:crypto';","import { chacha20poly1305 } from '@noble/ciphers/chacha.js';").replace(/        const cipher = createCipheriv\('chacha20-poly1305',[\s\S]*?const packet = Buffer.concat\(\[header, ciphertext, cipher.getAuthTag\(\), nonce.subarray\(4, 12\)\]\);/,`        const encrypted = chacha20poly1305(this.options.audioKey, nonce, header.subarray(4, 12)).encrypt(encoded);
        const packet = Buffer.concat([header, Buffer.from(encrypted), nonce.subarray(4, 12)]);`));
console.log('AirPlay Electron crypto compatibility patch ready');
