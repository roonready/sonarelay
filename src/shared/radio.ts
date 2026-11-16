export interface RadioStation { id: string; name: string; streamUrl: string }
export const radioStations: readonly RadioStation[] = [
  { id: 'nashe-radio', name: 'Наше Радио', streamUrl: 'https://nashe1.hostingradio.ru/nashe-256' },
  { id: 'radio-calico', name: 'Radio Calico', streamUrl: 'http://roon.radio-calico.com:8000/roon' },
];
export interface RadioMetadata { title: string; artist: string; streamTitle: string; streamUrl: string; station: string }
export interface RadioState {
  mode: 'radio' | 'music';
  status: 'stopped' | 'connecting' | 'playing' | 'error';
  stationId: string;
  outputId: string;
  error: string;
  metadata: RadioMetadata;
}
export function emptyRadioState(): RadioState {
  return { mode: 'radio', status: 'stopped', stationId: '', outputId: '', error: '', metadata: { title: '', artist: '', streamTitle: '', streamUrl: '', station: '' } };
}
