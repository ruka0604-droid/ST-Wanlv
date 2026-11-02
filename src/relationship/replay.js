function clone(v){return structuredClone(v);}
function pathParts(path){return String(path||'').split('.').filter(Boolean);}
function setPath(obj,path,value){const parts=pathParts(path);if(!parts.length)return value;let cur=obj;for(let i=0;i<parts.length-1;i++){const k=parts[i];if(!cur[k]||typeof cur[k]!=='object')cur[k]={};cur=cur[k];}cur[parts.at(-1)]=clone(value);return obj;}
function deletePath(obj,path){const parts=pathParts(path);if(!parts.length)return obj;let cur=obj;for(let i=0;i<parts.length-1;i++){if(!cur?.[parts[i]])return obj;cur=cur[parts[i]];}delete cur[parts.at(-1)];return obj;}
function mergePath(obj,path,value){const parts=pathParts(path);if(!parts.length||typeof value!=='object'||value===null)return obj;const existing=parts.reduce((a,k)=>a?.[k],obj);return setPath(obj,path,{...(existing&&typeof existing==='object'?existing:{}),...clone(value)});}
function incrementPath(obj,path,delta){const parts=pathParts(path);const existing=parts.reduce((a,k)=>a?.[k],obj);return setPath(obj,path,Number(existing||0)+Number(delta||0));}
export function emptyRelationship(){return {mode:'qualitative',stage:null,traits:{},variables:{},meta:{}};}
export function applyRelationshipDelta(state,delta){const next=clone(state||emptyRelationship());for(const c of delta?.changes||[]){if(c.op==='set')setPath(next,c.path,c.value);else if(c.op==='merge')mergePath(next,c.path,c.value);else if(c.op==='delete')deletePath(next,c.path);else if(c.op==='increment')incrementPath(next,c.path,c.value);}return next;}
export function replayRelationshipDeltas(deltas,base=emptyRelationship()){return (deltas||[]).filter(d=>d.status==='active').sort((a,b)=>a.createdAt-b.createdAt).reduce((s,d)=>applyRelationshipDelta(s,d),clone(base));}
