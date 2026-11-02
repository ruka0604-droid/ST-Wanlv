export const VERSION = '0.8.1';
export const DB_NAME = 'ST-Wanlv';
export const DB_VERSION = 8;
export const MEMORY_TYPES = Object.freeze({ FACT:'FACT', INFERENCE:'INFERENCE', BELIEF:'BELIEF', PRIVATE_COGNITION:'PRIVATE_COGNITION' });
export const VISIBILITY = Object.freeze({ PLAYER_ONLY:'PLAYER_ONLY', CHARACTER_ONLY:'CHARACTER_ONLY', SHARED:'SHARED', SYSTEM_ONLY:'SYSTEM_ONLY', UNKNOWN:'UNKNOWN' });
export const TASK_STATUS = Object.freeze({ QUEUED:'queued', RUNNING:'running', DONE:'done', FAILED:'failed', CANCELLED:'cancelled' });
export const DEFAULT_SETTINGS = Object.freeze({
  floatingEnabled:true, apiMode:"tavern", apiUrl:"", apiModel:"", enabled:true, autoCapture:true, autoExtract:false, injectEnabled:true,
  recallLimit:8, minRecallScore:0.40, maxInjectedChars:6000,
  autoInvalidateStaleEvidence:true, rememberUserOnly:false, autoStateExtract:false,
  autoRelationshipExtract:false, recallUseRecency:true, recallUseEntities:true,
  taskConcurrency:1, taskRetryLimit:2, taskRecentMessages:12, debugLogs:false, autoConsolidate:false, consolidationThreshold:0.55, maxClusterSize:8
});
