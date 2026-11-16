export interface LanInterface { name: string; address: string; netmask: string; virtual: boolean }
export interface DlnaService { type: string; controlUrl: string; scpdUrl: string; actions: string[] }
export interface RendererDevice {
  protocol?:'dlna'|'bluos'|'cast'|'airplay2'|'slimproto'; apiPort?:number; slimPlayerId?:string; airplayPairingRequired?:boolean; airplayTiming?:'ptp'|'ntp'; capabilities?:string[];
  id: string; name: string; manufacturer: string; model: string; ip: string;
  location: string; usn: string; st: string; server: string;
  services: DlnaService[]; expiresAt: number; status: 'available';
}
export interface DiscoveryState {
  diagnostics: { replies: number; descriptions: number; unicastPeers: number; bluosDevices?:number; castDevices?:number; slimAddress?:string; slimError?:string; };
  interfaces: LanInterface[]; selectedAddress: string; devices: RendererDevice[];
  scanning: boolean; error: string; lastScan: number | null;
}
export interface BridgeApi {
  getUpdateState(): Promise<AppUpdateState>;
  checkUpdates(): Promise<AppUpdateState>;
  installUpdate(): Promise<void>;
  onUpdateState(callback: (state: AppUpdateState) => void): () => void;
  getSystemLanguage(): Promise<string>;
  lastfmState():Promise<LastfmState>;
  lastfmConnect():Promise<LastfmState>;
  lastfmConfirm():Promise<LastfmState>;
  lastfmDisconnect():Promise<LastfmState>;
  lastfmSettings(settings:LastfmPreferences):Promise<LastfmState>;
  onLastfmState(callback:(state:LastfmState)=>void):()=>void;
  getMetadata():Promise<MusicMetadataSnapshot>;
  onMetadata(callback:(snapshot:MusicMetadataSnapshot)=>void):()=>void;
  liveBegin(deviceId:string,sampleRate:number):Promise<LiveState>;
  livePcm(sessionId:string,data:Uint8Array):Promise<void>;
  liveConnect(sessionId:string):Promise<LiveState>;
  liveStop(sessionId:string):Promise<void>;
  onLiveState(callback:(state:LiveState)=>void):()=>void;
  captureBegin(sampleRate: number): Promise<void>;
  capturePcm(data: Uint8Array): void;
  captureFinish(): Promise<CaptureResult>;
  playback(deviceId: string, command: PlaybackCommand, value?: number): Promise<PlaybackState>;
  getState(): Promise<DiscoveryState>;
  scan(address: string): Promise<DiscoveryState>;
  onState(callback: (state: DiscoveryState) => void): () => void;
}
export type UpdateChannel = 'stable' | 'beta';
export interface AppUpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  channel: UpdateChannel;
  currentVersion: string;
  version: string;
  percent: number;
  error: 'updates.checkError' | 'updates.downloadError' | 'updates.installError' | '';
}
export type PlaybackCommand = 'test' | 'recording' | 'play' | 'pause' | 'stop' | 'status' | 'volume';
export interface CaptureResult { path: string; sampleRate: number; channels: 2; bitDepth: 16; seconds: number; peak: number }
export interface PlaybackState { deviceId: string; status: string; error: string; busy: boolean; volume: number | null; httpRequests: number }
export interface LiveState { playbackReady?:boolean; encoding?:'flac'|'mp3'|'alac'; packets?:number; timingExchanges?:number; underruns?:number; volume:number|null; sessionId:string; deviceId:string; active:boolean; connected:boolean; status:string; error:string; sampleRate:number; pcmBytes:number; encodedBytes:number; connections:number; httpRequests:number }
export interface MusicMetadataField {
 id:string;
 label:string;
 value:string|null;
 source:string|null;
 detail:string;
}
export interface MusicMetadataSnapshot {
 playback?:MusicPlaybackSnapshot;
 fields:MusicMetadataField[];
 artwork:string|null;
 updatedAt:number;
 error:string;
}
export interface MusicPlaybackSnapshot {
 title:string;artist:string;album:string;trackId:string;
 duration:number|null;position:number|null;playing:boolean;rate:number;
}
export interface LastfmPreferences {scrobbling:boolean;nowPlaying:boolean}
export interface LastfmState extends LastfmPreferences {
 configured:boolean;connected:boolean;username:string;pendingAuthorization:boolean;busy:boolean;error:string;
}
