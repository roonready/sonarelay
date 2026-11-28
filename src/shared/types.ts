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
export interface WindowsVolumeState {volume:number;muted:boolean}
export interface ProxySettings { server: string; username: string; hasPassword: boolean; loadError: boolean }
export interface ProxySettingsInput { server: string; username: string; password: string }

export interface BridgeApi {
 getProxySettings(): Promise<ProxySettings>;
 saveProxySettings(input: string): Promise<ProxySettings>;
  windowsVolume(value?:number):Promise<WindowsVolumeState>;
  receiverVolume(deviceId:string,value?:number):Promise<{deviceId:string;volume:number}>;
  getUpdateState(): Promise<AppUpdateState>;
  checkUpdates(): Promise<AppUpdateState>;
  installUpdate(): Promise<void>;
  onUpdateState(callback: (state: AppUpdateState) => void): () => void;
  getSystemLanguage(): Promise<string>;
  scrobblerState(): Promise<ScrobblerState>;
  saveScrobbler(settings: ScrobblerSettings): Promise<ScrobblerState>;
  onScrobblerState(callback: (state: ScrobblerState) => void): () => void;
  lastfmState():Promise<LastfmState>;
  lastfmOpenProfile():Promise<void>;
  lastfmConnect():Promise<LastfmState>;
  lastfmConfirm():Promise<LastfmState>;
  lastfmDisconnect():Promise<LastfmState>;
  lastfmSettings(settings:LastfmPreferences):Promise<LastfmState>;
  onLastfmState(callback:(state:LastfmState)=>void):()=>void;
  getMetadata():Promise<MusicMetadataSnapshot>;
  onMetadata(callback:(snapshot:MusicMetadataSnapshot)=>void):()=>void;
  liveBegin(deviceId:string):Promise<LiveState>;
  liveConnect(sessionId:string):Promise<LiveState>;
  liveStop(sessionId:string):Promise<void>;
  onLiveState(callback:(state:LiveState)=>void):()=>void;
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
export type PlaybackCommand = 'play' | 'pause' | 'stop' | 'status' | 'volume';
export interface LiveState { playbackReady?:boolean; encoding?:'flac'|'mp3'|'alac'; packets?:number; timingExchanges?:number; underruns?:number; volume:number|null; sessionId:string; deviceId:string; active:boolean; connected:boolean; status:string; error:string; sampleRate:number; pcmBytes:number; encodedBytes:number; connections:number; httpRequests:number }
export interface MusicMetadataSnapshot {
 playback?:MusicPlaybackSnapshot;
 artwork:string|null;
 updatedAt:number;
 error:string;
}
export interface MusicPlaybackSnapshot {
 sourceId?:string;
 title:string;artist:string;album:string;trackId:string;
 albumArtist?:string;trackNumber?:number;albumTrackCount?:number;playbackType?:string;
 duration:number|null;position:number|null;playing:boolean;rate:number;
}
export interface ScrobblerSettings { url: string; enabled: boolean; token?: string }
export interface ScrobblerState {
  url: string;
  enabled: boolean;
  hasToken: boolean;
  pending: number;
  rejected: number;
  lastSent: number | null;
  error: '' | 'storage' | 'auth' | 'endpoint' | 'retry' | 'artwork';
}
export interface LastfmPreferences {scrobbling:boolean;nowPlaying:boolean}
export interface LastfmState extends LastfmPreferences {
 activity?:{kind:'nowPlaying'|'scrobble';artist:string;title:string;at:number};
 configured:boolean;connected:boolean;username:string;pendingAuthorization:boolean;busy:boolean;error:string;
}
