import { callMemoryAI } from './api-client.js';
function parse(raw){const text=String(raw||'').replace(/^```json\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(text);}catch{const m=text.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);throw new Error('关系AI输出不是有效JSON');}}
export async function extractRelationshipSignals(context,recent,relation){
 const prompt=`你是“万缕”关系分析器。只分析聊天正文中已经发生、能支持关系判断的事件，不创造剧情。\n当前关系：${JSON.stringify({type:relation?.type,mode:relation?.mode,stage:relation?.stage,traits:relation?.traits})}\n聊天：\n${recent}\n\n输出严格JSON：{"signals":[{"type":"trust_gain|trust_loss|intimacy_gain|intimacy_loss|conflict|reconciliation|care|rejection|commitment|distance|custom","reason":"简短证据解释","importance":0.0,"evidenceMessageIndexes":[0]}]}。\n规则：1.只输出有明确证据的信号；2.不要输出数值变化；3.不要把一次情绪等同于长期关系；4.普通争吵不是自动负面扣分；5.不要泄露PRIVATE_COGNITION；6.如果没有足够证据，signals为空。`;
 const raw=await callMemoryAI(context,prompt);const data=parse(raw);return Array.isArray(data.signals)?data.signals:[];
}
