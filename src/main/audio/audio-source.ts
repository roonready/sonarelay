import type { PcmFormat } from './wav';
export interface AudioSource {
 start(): Promise<void>;
 stop(): Promise<void>;
 onAudioData(callback: (pcm: Buffer) => void): void;
}
export type AudioFormat = PcmFormat;
