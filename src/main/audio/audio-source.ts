export interface AudioSource {
 start(): Promise<void>;
 stop(): Promise<void>;
 onAudioData(callback: (pcm: Buffer) => void): void;
}
export interface AudioFormat { sampleRate: number; channels: 2; bitDepth: 16 }
