export const supportedLanguages = ['en', 'ru'] as const;
export type Language = typeof supportedLanguages[number];
export const languageStorageKey = 'sonarelay.language';
export function isLanguage(value: unknown): value is Language {
  return supportedLanguages.includes(value as Language);
}
export function detectLanguage(systemLanguage: string): Language {
  const base = systemLanguage.toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : 'en';
}
export function initialLanguage(saved: unknown, systemLanguage: string): Language {
  return isLanguage(saved) ? saved : detectLanguage(systemLanguage);
}
