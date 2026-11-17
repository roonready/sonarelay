import type { LiveState } from './types';
export const RADIO_PCM_FORMAT={sampleRate:48000,channels:2,bitDepth:16} as const;
export interface RadioStation { id: string; name: string; streamUrl: string }
export const radioStations: readonly RadioStation[] = [
  { id: 'nashe-radio', name: 'Наше Радио', streamUrl: 'https://nashe1.hostingradio.ru/nashe-256' },
  { id: 'radio-calico', name: 'Radio Calico', streamUrl: 'http://roon.radio-calico.com:8000/roon' },
];
export interface RadioMetadata { title: string; artist: string; streamTitle: string; streamUrl: string; station: string }
export interface RadioStreamInfo {
  codec:string|null; sampleRate:number|null; channels:number|null; bitDepth:number|null;
  bitrate:number|null; bitrateSource:'codec'|'station'|null;
}
export function radioOutputInfo(outputId:string,live?:LiveState):RadioStreamInfo|null{
 if(!outputId)return {codec:'pcm_s16le',...RADIO_PCM_FORMAT,bitrate:RADIO_PCM_FORMAT.sampleRate*RADIO_PCM_FORMAT.channels*RADIO_PCM_FORMAT.bitDepth,bitrateSource:'codec'};
 if(!live?.active||live.deviceId!==outputId||!live.encoding)return null;
 return {codec:live.encoding,sampleRate:live.encoding==='alac'?44100:live.sampleRate,channels:2,bitDepth:live.encoding==='mp3'?null:16,
  bitrate:live.encoding==='mp3'?(live.sampleRate>=32000?320000:128000):null,bitrateSource:live.encoding==='mp3'?'codec':null};
}
export interface RadioState {
  mode: 'radio' | 'music';
  status: 'stopped' | 'connecting' | 'playing' | 'error';
  stationId: string;
  outputId: string;
  error: string;
  metadata: RadioMetadata;
  stream?:RadioStreamInfo|null;
}
export function emptyRadioState(): RadioState {
  return { mode: 'radio', status: 'stopped', stationId: '', outputId: '', error: '', stream:null, metadata: { title: '', artist: '', streamTitle: '', streamUrl: '', station: '' } };
}
