import type { IpcApi, PlatformInfo } from '../shared/types';

declare global {
  interface Window {
    api: IpcApi;
    platform: PlatformInfo;
  }
}

export const api = window.api;
export const platform = window.platform;

// Listen for menu events from main
export function onMenu(event: string, handler: () => void): () => void {
  const listener = (_e: any) => handler();
  const ipc = (window as any).require?.('electron')?.ipcRenderer;
  if (ipc) {
    ipc.on(event, listener);
    return () => ipc.removeListener(event, listener);
  }
  // Fallback: dispatched via global event
  window.addEventListener(event, listener as any);
  return () => window.removeEventListener(event, listener as any);
}
