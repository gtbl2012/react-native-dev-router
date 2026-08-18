// Hand-written declarations for glimpseui (ships no types).
// Only the surface used by this project is declared.
declare module 'glimpseui' {
  import type { EventEmitter } from 'node:events';

  export interface GlimpseOptions {
    width?: number;
    height?: number;
    title?: string;
  }

  export interface GlimpseWindow extends EventEmitter {
    /** Evaluate JavaScript inside the WebView. */
    send(js: string): void;
    /** Replace the entire page content. */
    setHTML(html: string): void;
    close(): void;
    on(event: 'ready', listener: (info: unknown) => void): this;
    on(event: 'message', listener: (data: unknown) => void): this;
    on(event: 'click' | 'closed', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  export interface GlimpseStatusItem extends GlimpseWindow {
    /** Update the menu bar label. */
    setTitle(title: string): void;
    /** Change the popover dimensions. */
    resize(width: number, height: number): void;
  }

  /** macOS only — throws on Linux and Windows. */
  export function statusItem(html: string, options?: GlimpseOptions): GlimpseStatusItem;
  export function open(html: string, options?: GlimpseOptions): GlimpseWindow;
  /**
   * Resolved native binary path (honors GLIMPSE_BINARY_PATH/GLIMPSE_HOST_PATH
   * env overrides). Throws on unsupported platforms.
   */
  export function getNativeHostInfo(): { path: string; platform: string; buildHint?: string };
}
