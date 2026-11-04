import { WanlvApp } from './src/core/wanlv.js';

let app = null;
let initializing = null;

export async function init() {
  if (initializing) return initializing;
  if (app) {
    await app.enable();
    return app;
  }
  initializing = (async () => {
    const candidate = new WanlvApp();
    await candidate.init();
    app = candidate;
    globalThis.Wanlv = app.publicApi();
    console.info('[万缕] V0.8.3 loaded');
    return app;
  })();
  try {
    return await initializing;
  } catch (error) {
    console.error('[万缕] init failed', error);
    throw error;
  } finally {
    initializing = null;
  }
}

export async function onEnable() {
  return init();
}

export async function onDisable() {
  // A disable request must also win over an in-progress initialization.
  if (initializing) {
    try { await initializing; } catch { /* initialization failed */ }
  }
  await app?.disable?.();
}

globalThis.Wanlv_init = init;
if (globalThis.SillyTavern?.getContext) {
  init().catch(error => console.error('[万缕] startup failed', error));
}
