import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_BIN = path.join(ROOT, 'node_modules', '.bin', 'electron');

/**
 * Launch the Electron app for one test. We point Electron at the built
 * dist-electron + dist outputs (not the Vite dev server) so the test is
 * self-contained — no separate `vite` process needed.
 *
 * Each launch gets a fresh `userData` directory so persisted state from a
 * previous test (connections, settings, query history) never leaks. The
 * directory is cleaned up by the returned `dispose` function.
 *
 * Returns the app + the first BrowserWindow Page, both ready to drive.
 */
export interface Launched {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  dispose: () => Promise<void>;
}

export async function launchApp(extraEnv: Record<string, string> = {}): Promise<Launched> {
  // Isolate userData per launch — Electron caches connections, settings,
  // license, history there. Setting ELECTRON_USER_DATA_DIR also makes the
  // store.ts code path use this dir (it reads app.getPath('userData')).
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'mili-e2e-'));

  // Build a clean env. `main.ts` checks `VITE_DEV_SERVER_URL !== undefined` to
  // decide between dev URL and packaged file, so we have to actually delete
  // the variable (not set it to ''). Avoid spreading process.env wholesale —
  // a stray dev-server-url in the test runner shell would derail every test.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === 'VITE_DEV_SERVER_URL') continue;
    if (typeof v === 'string') env[k] = v;
  }
  env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  env.MILI_E2E = '1';
  Object.assign(env, extraEnv);

  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [
      ROOT,
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
    ],
    env,
  });

  // The first window is the home window when there's no saved route.
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Wait for the React app to mount.
  await page.waitForFunction(() => !!document.querySelector('#root > *'), { timeout: 15_000 });

  return {
    app, page, userDataDir,
    async dispose() {
      try { await app.close(); } catch { /* ignore */ }
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

/**
 * Helper: press a Mac-style shortcut. Playwright's `page.keyboard.press`
 * accepts Meta+Key on Mac, Control+Key on Linux/Windows. We always send
 * the Meta variant because Electron normalizes the modifier on macOS.
 *
 * Note: many of the app's shortcuts (⌘K, ⌘T, ⌘N, ⌘R, ⌘W, ⌘1–9) are
 * registered as Electron menu accelerators in `src/main/main.ts`. Those
 * accelerators consume the keypress in the main process and dispatch an
 * IPC message to the renderer — so a raw `page.keyboard.press('Meta+K')`
 * never reaches the React `keydown` listener. Use `openPalette()` /
 * `openKeymap()` instead when you want the side effect.
 */
export async function shortcut(page: Page, combo: string) {
  await page.keyboard.press(combo);
}

/**
 * Open the command palette by dispatching a synthetic ⌘P keydown on the
 * window. The renderer's React-side handler (App.tsx) listens on window for
 * keydown events with metaKey/ctrlKey + 'p' / 'k' / ';' and sets the palette.
 *
 * Using a synthetic event sidesteps two Electron-on-test quirks:
 *  - Menu accelerators (⌘K, ⌘T, ⌘N) consume the keypress in main before it
 *    reaches the renderer at all.
 *  - In headless Playwright sessions, ⌘P sometimes fires Chromium's "Print"
 *    intercept before our handler can preventDefault.
 */
export async function openPalette(_app: ElectronApplication, page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'p', metaKey: true, ctrlKey: false, bubbles: true,
    }));
  });
  await page.waitForSelector('input[placeholder*="command" i]', { state: 'visible' });
}

/** Open the keyboard cheatsheet by dispatching its window event. */
export async function openKeymap(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mili:show-keymap')));
  await page.waitForSelector('text=Keyboard shortcuts', { state: 'visible' });
}

/** Open the About modal via its event. */
export async function openAbout(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mili:show-about')));
  await page.waitForSelector('[role="heading"][aria-label]', { state: 'attached' }).catch(() => {});
}

/** Open Changelog modal via its event. */
export async function openChangelog(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mili:show-changelog')));
}
