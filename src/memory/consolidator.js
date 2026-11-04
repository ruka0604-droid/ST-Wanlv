import { hashString } from '../identity/chat-identity.js';
import { MEMORY_TYPES } from '../core/config.js';
import { callMemoryAI } from '../ai/api-client.js';

function tokens(text){return new Set(String(text||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>1));}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(1,Math.min(A.size,B.size));}
function mergeEvidence(items){const map=new Map();for(const m of items)for(const e of (m.evidence||[])){const k=`${e.floorId||''}|${e.hash||''}|${e.revision||''}`;if(!map.has(k))map.set(k,e);}return [...map.values()];}
function mergeEntities(items){return [...new Set(items.flatMap(m=>m.entityIds||[]))];}
function mergeKeywords(items){return [...new Set(items.flatMap(m=>m.keywords||[]).map(x=>String(x).trim()).filter(Boolean))].slice(0,16);}
function compatible(a,b){return a.chatId===b.chatId&&a.type===b.type&&a.visibility===b.visibility;}

export class MemoryConsolidator{
  constructor(store,memoryManager){this.store=store;this.memoryManager=memoryManager;}
  async findClusters(chatId,{threshold=.55,maxClusterSize=8}={}){
    const memories=(await this.memoryManager.listMemories(chatId)).filter(m=>!m.locked && m.status==='active');
    const used=new Set(),clusters=[];
    for(const base of memories){if(used.has(base.id))continue;const group=[base];
      for(const candidate of memories){if(candidate.id===base.id||used.has(candidate.id)||group.length>=maxClusterSize)continue;if(!compatible(base,candidate))continue;if(similarity(base.text,candidate.text)>=threshold)group.push(candidate);}
      if(group.length>1){group.forEach(m=>used.add(m.id));clusters.push(group);}
    }
    return clusters;
  }
  async summarizeCluster(context,cluster){
    const source=cluster.map((m,i)=>`${i+1}. [${m.type}] ${m.text}`).join('\n');
    const prompt=`你是长期记忆合并器。请把下面多条同类长期记忆合并成一条更稳定、更简洁的记忆。只保留所有条目都能被证据支持的核心信息，不补充新事实，不改变原意，不把推测升级为事实。返回严格JSON对象：{"text":"...","confidence":0.0,"importance":0.0}。\n原记忆：\n${source}`;
    try{const raw=await callMemoryAI(context,prompt);const clean=String(raw||'').replace(/^```json\s*/,'').replace(/```$/,'').trim();const out=JSON.parse(clean);if(out?.text)return {text:String(out.text).trim(),confidence:Number(out.confidence),importance:Number(out.importance)};}catch(e){console.warn('[万缕] consolidation AI failed, using deterministic merge',e);}
    const best=[...cluster].sort((a,b)=>(b.importance+b.confidence)-(a.importance+a.confidence))[0];
    return {text:best.text,confidence:Math.max(...cluster.map(x=>Number(x.confidence)||0)),importance:Math.max(...cluster.map(x=>Number(x.importance)||0))};
  }
  async consolidateChat(context,chatId,options={}){
    const clusters=await this.findClusters(chatId,options);const results=[];
    for(const cluster of clusters){
      const summary=await this.summarizeCluster(context,cluster);const base=cluster[0];
      const evidence=mergeEvidence(cluster);const entityIds=mergeEntities(cluster);const keywords=mergeKeywords(cluster);
      const id=`mem_${hashString(`${chatId}|consolidated|${base.type}|${summary.text}`)}`;
      const existing=await this.store.get('memories',id);
      const memory={id,chatId,floorId:null,type:base.type,text:summary.text,visibility:base.visibility,confidence:Math.max(0,Math.min(1,summary.confidence||.7)),importance:Math.max(0,Math.min(1,summary.importance||.5)),entityIds,keywords,evidence,locked:false,status:'active',source:'consolidated',createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now(),mergedFrom:cluster.map(x=>x.id)};
      await this.store.put('memories',memory);
      for(const old of cluster)await this.memoryManager.archiveMemory(old.id,'consolidated');
      await this.store.put('memory_clusters',{id:`cluster_${Date.now()}_${Math.random().toString(36).slice(2)}`,chatId,memoryId:memory.id,sourceMemoryIds:cluster.map(x=>x.id),status:'active',createdAt:Date.now(),updatedAt:Date.now()});
      for(const old of cluster)await this.store.put('memory_versions',{id:`mv_${old.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,chatId,memoryId:old.id,replacedBy:memory.id,reason:'consolidated',snapshot:old,createdAt:Date.now()});
      results.push({memory,sourceIds:cluster.map(x=>x.id)});
    }
    return {clusters:clusters.length,consolidated:results.length,results};
  }
}
