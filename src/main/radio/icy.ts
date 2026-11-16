import { Transform, type TransformCallback } from 'node:stream';
import type { RadioMetadata } from '../../shared/radio';

export function icyMetadata(data: Buffer): Partial<RadioMetadata> {
  const text = new TextDecoder('utf-8').decode(data).replace(/\0+$/, '');
  const title = /StreamTitle='([\s\S]*?)';/.exec(text)?.[1]?.replace(/[\x00-\x1f]/g, '').slice(0, 2048) ?? '';
  const streamUrl = /StreamUrl='([\s\S]*?)';/.exec(text)?.[1]?.replace(/[\x00-\x1f]/g, '').slice(0, 2048) ?? '';
  const separator = title.indexOf(' - ');
  return { streamTitle: title, artist: separator > 0 ? title.slice(0, separator) : '', title: separator > 0 ? title.slice(separator + 3) : title, streamUrl };
}

/** Strip ICY blocks before decoding; neither packet boundaries nor metadata are audio frames. */
export class IcyDemux extends Transform {
  private audioRemaining: number;
  private metadataRemaining = -1;
  private metadata: Buffer[] = [];
  constructor(private interval: number) {
    super();
    if (!Number.isSafeInteger(interval) || interval < 0 || interval > 16 * 1024 * 1024) throw new Error('radio.invalidStream');
    this.audioRemaining = interval;
  }
  _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback) {
    if (!this.interval) { this.push(chunk); done(); return; }
    let position = 0;
    while (position < chunk.length) {
      if (this.audioRemaining) {
        const count = Math.min(this.audioRemaining, chunk.length - position);
        this.push(chunk.subarray(position, position + count)); position += count; this.audioRemaining -= count;
      } else if (this.metadataRemaining === -1) {
        this.metadataRemaining = chunk[position++] * 16;
        if (!this.metadataRemaining) { this.metadataRemaining = -1; this.audioRemaining = this.interval; }
      } else {
        const count = Math.min(this.metadataRemaining, chunk.length - position);
        this.metadata.push(chunk.subarray(position, position + count)); position += count; this.metadataRemaining -= count;
        if (!this.metadataRemaining) {
          this.emit('metadata', icyMetadata(Buffer.concat(this.metadata)));
          this.metadata = []; this.metadataRemaining = -1; this.audioRemaining = this.interval;
        }
      }
    }
    done();
  }
}
