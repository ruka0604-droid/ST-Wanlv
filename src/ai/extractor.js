import { callMemoryAI } from './api-client.js';
import { MEMORY_TYPES, VISIBILITY } from '../core/config.js';

export async function extractMemories(context, recent, meta={}){
  const prompt=`你是长期记忆整理器。只提取有证据的内容，不要把猜测写成事实。\n返回严格 JSON 数组，每项字段：type(text=FACT|INFERENCE|BELIEF|PRIVATE_COGNITION), text, confidence(0-1), importance(0-1), visibility(${Object.values(VISIBILITY).join('|')}), entityNames(array), keywords(array：0-8 个可检索的关键物品名称、事件称呼、地点或信物名称), evidenceFloorIndexes(array)。关键词必须能从聊天正文直接确认，禁止臆造。聊天行首的楼层编号从0开始，证据楼层必须引用这些编号。\n规则：FACT必须能直接从聊天正文证明；INFERENCE是合理推断；BELIEF是角色或用户相信但未必真实的内容；PRIVATE_COGNITION是角色内心认知。不要创造聊天中没有的信息。\n聊天：\n${recent}`;
  const raw=await callMemoryAI(context,prompt); const text=String(raw||'').replace(/^```json\s*/,'').replace(/```$/,'').trim();
  let data;try{data=JSON.parse(text);}catch{throw new Error('AI没有返回有效JSON');}
  if(!Array.isArray(data))return [];
  return data.filter(x=>Object.values(MEMORY_TYPES).includes(x.type)&&x.text).map(x=>({...x,entityNames:Array.isArray(x.entityNames)?x.entityNames:[],keywords:Array.isArray(x.keywords)?x.keywords.map(v=>String(v).trim()).filter(Boolean).slice(0,8):[],evidenceFloorIndexes:Array.isArray(x.evidenceFloorIndexes)?x.evidenceFloorIndexes:[]}));
}
