import { createI18n } from 'vue-i18n';
import { watch } from 'vue';
import en from '../../../shared/locales/en.json';
import ru from '../../../shared/locales/ru.json';
import { initialLanguage, isLanguage, languageStorageKey, supportedLanguages } from '../../../shared/language';

export { supportedLanguages };
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, ru },
  datetimeFormats: {
    en: { time: { hour: 'numeric', minute: '2-digit', second: '2-digit' } },
    ru: { time: { hour: '2-digit', minute: '2-digit', second: '2-digit' } },
  },
  numberFormats: {
    en: { decimal: { maximumFractionDigits: 1 } },
    ru: { decimal: { maximumFractionDigits: 1 } },
  },
});

export async function initializeLanguage() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(languageStorageKey); } catch { /* Storage may be unavailable. */ }
  let systemLanguage = '';
  if (!isLanguage(saved)) {
    try { systemLanguage = await window.bridge?.getSystemLanguage() || navigator.language; }
    catch { systemLanguage = navigator.language; }
  }
  i18n.global.locale.value = initialLanguage(saved, systemLanguage);
  document.documentElement.lang = i18n.global.locale.value;
  try { localStorage.setItem(languageStorageKey, i18n.global.locale.value); } catch { /* Session only. */ }
  watch(i18n.global.locale, value => {
    document.documentElement.lang = value;
    try { localStorage.setItem(languageStorageKey, value); } catch { /* The current session still works. */ }
  }, { flush: 'sync' });
}

export function selectLanguage(value: string) {
  if (isLanguage(value)) i18n.global.locale.value = value;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const runtimeMessages = Object.entries(ru).map(([key, value]) => {
  const names: string[] = [];
  const pattern = value.split(/(\{\w+\})/g).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '([\\s\\S]*?)'; }
    return escape(part);
  }).join('');
  return { key, names, pattern: new RegExp('^' + pattern + '$') };
});

/** Translate only app-owned messages, never device names or music content. */
function errorMessage(input: unknown): string {
  let value = String(input ?? '');
  // String(Error) adds an outer "Error:" around Electron's remote-error wrapper.
  // Unwrap in layers rather than depending on one particular nesting order.
  for (let i = 0; i < 6; i++) {
    const next = value.replace(/^Error:\s*/, '').replace(/^Error invoking remote method '[^']+':\s*/, '');
    if (next === value) break;
    value = next;
  }
  return value;
}

export function localizeMessage(input: unknown, depth = 0): string {
  const value = errorMessage(input);
  if (!value || depth > 4) return value;
  if (i18n.global.te(value)) return i18n.global.t(value);
  const stateKey: Record<string, string> = {
    PLAYING: 'status.playing', playing: 'status.playing', play: 'status.playing', stream: 'status.playing',
    PAUSED_PLAYBACK: 'status.paused', PAUSED: 'status.paused', paused: 'status.paused', pause: 'status.paused',
    STOPPED: 'status.stopped', stop: 'status.stopped', TRANSITIONING: 'status.transitioning',
    NO_MEDIA_PRESENT: 'status.noMedia', ended: 'status.ended',
  };
  if (stateKey[value]) return i18n.global.t(stateKey[value]);
  for (const entry of runtimeMessages) {
    const match = entry.pattern.exec(value);
    if (!match) continue;
    const parameters = Object.fromEntries(entry.names.map((name, i) => [name, localizeMessage(match[i + 1], depth + 1)]));
    return i18n.global.t(entry.key, parameters);
  }
  return value;
}

/** Raw OS/library errors are diagnostics, not translatable application copy. */
export function localizeError(input: unknown): string {
  const value = localizeMessage(input);
  const raw = errorMessage(input);
  if (!raw || value !== raw || runtimeMessages.some(entry => entry.pattern.test(raw))) return value;
  if (/E(?:CONN|HOST|NET|PIPE|TIMEDOUT)|fetch|socket|network/i.test(raw)) return i18n.global.t('errors.network');
  if (/NotAllowedError|Permission denied/i.test(raw)) return i18n.global.t('errors.permission');
  if (/NotFoundError|NotReadableError|AbortError/i.test(raw)) return i18n.global.t('errors.capture');
  return i18n.global.t('errors.unknown');
}
