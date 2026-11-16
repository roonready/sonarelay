import ru from './locales/ru.json';

export type MessageParameters = Record<string, unknown>;
// Keep the existing wire representation stable for diagnostics and protocol
// adapters. The renderer resolves it against the selected locale at render time.
export function message(key: string, parameters: MessageParameters = {}): string {
  const template = (ru as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(parameters[name] ?? ''));
}
