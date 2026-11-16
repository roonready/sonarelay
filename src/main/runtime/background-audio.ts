import type { CommandLine } from 'electron';
// Must run before Chromium starts; backgroundThrottling alone does not set
// the global renderer process/background timer policy.
export function configureBackgroundAudio(commandLine: Pick<CommandLine,'appendSwitch'>){
 for(const name of ['disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows']){
  commandLine.appendSwitch(name);
 }
}
