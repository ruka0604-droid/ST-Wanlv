import { WanlvApp } from './src/core/wanlv.js';
let app;let initializing=null;
export async function init(){if(app)return app;if(initializing)return initializing;initializing=(async()=>{app=new WanlvApp();await app.init();globalThis.Wanlv_generateInterceptor=async function(chat,contextSize,abort,type){return app?.interceptGeneration?.(chat,contextSize,abort,type);};globalThis.Wanlv=app.publicApi();console.info('[万缕] V0.8 loaded');return app;})();try{return await initializing;}catch(e){console.error('[万缕] init failed',e);throw e;}finally{initializing=null;}}
export async function onDisable(){await app?.disable?.();}
globalThis.Wanlv_init=init;
if(globalThis.SillyTavern?.getContext)init();
