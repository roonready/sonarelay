import type { MusicMetadataField, MusicMetadataSnapshot } from '../../../shared/types';
import { i18n, localizeMessage } from './index';

/** Only format app-owned values. Song titles, artists, URLs and page text pass through. */
export function metadataValue(field: MusicMetadataField, snapshot: MusicMetadataSnapshot): string {
  const value = field.value ?? '';
  const playback = snapshot.playback;
  let seconds: number | null | undefined;
  if (field.id === 'duration') seconds = playback?.duration;
  if (field.id === 'position') seconds = playback?.position;
  if (field.id === 'remaining' && playback?.duration != null && playback.position != null) {
    seconds = Math.max(0, playback.duration - playback.position);
  }
  if (seconds != null) {
    const whole = Math.max(0, Math.floor(seconds));
    const duration = [Math.floor(whole / 60), whole % 60].map(v => String(v).padStart(2, '0')).join(':');
    return i18n.global.t('metadata.durationValue', { duration, seconds: i18n.global.n(seconds, 'decimal') });
  }
  if (field.id === 'rate') return i18n.global.t('metadata.rateValue', { value: i18n.global.n(Number(value.replace('×', '')), 'decimal') });
  if (field.id === 'volume') return new Intl.NumberFormat(i18n.global.locale.value, { style: 'percent' }).format(Number(value.replace('%', '').trim()) / 100);
  if (['playback', 'muted', 'ready'].includes(field.id)) return localizeMessage(value);
  return value;
}
