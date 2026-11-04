import { lexicalMatch, hasTopicMatch } from '../recall/scorer.js';
import { hashString } from '../identity/chat-identity.js';
const clean=v=>String(v??'').trim();
const orderValue=e=>Number.isFinite(Number(e?.floorIndexes?.[0]))?Number(e.floorIndexes[0]):Number(e?.occurredAt||e?.createdAt||0);
export const EVENT_TYPES=['meeting','conversation','conflict','reconciliation','intimacy','sexual_event','date','betrayal','injury','secret','gift','promise','cooperation','custom'];
const hasPair=(ps,a,b)=>ps.includes(a)&&ps.includes(b);
export class EventManager{
 constructor(store){this.store=store;}
 makeId(chatId,sourceKey,type,summary,participants){return `evt_${hashString([chatId,sourceKey,type,summary,...participants].join('|'))}`;}
 async addEvent({chatId,type='custom',summary,participants=[],floorIds=[],floorIndexes=[],consequences=[],stateChanges=[],relationshipChanges=[],importance=.7,source='ai',status='active',occurredAt=null}={}){
  if(!chatId||!clean(summary))return null;const ps=[...new Set(participants.map(clean).filter(Boolean))];const sourceKey=floorIds.slice().sort().join('|')||floorIndexes.slice().sort((a,b)=>a-b).join('|')||'manual';const id=this.makeId(chatId,sourceKey,type,clean(summary),ps);const old=await this.store.get('events',id);const event={id,chatId,type:EVENT_TYPES.includes(type)?type:'custom',summary:clean(summary),participants:ps,floorIds:[...new Set(floorIds)],floorIndexes:[...new Set(floorIndexes)],consequences:Array.isArray(consequences)?consequences:[],stateChanges:Array.isArray(stateChanges)?stateChanges:[],relationshipChanges:Array.isArray(relationshipChanges)?relationshipChanges:[],importance:Number(importance??.7),source,status,occurredAt:occurredAt||old?.occurredAt||Date.now(),createdAt:old?.createdAt||Date.now(),updatedAt:Date.now(),version:(old?.version||0)+1};await this.store.put('events',event);return event;
 }
 async list(chatId,{status='active',limit=500}={}){const all=await this.store.getByIndex('events','chatId',chatId);return all.filter(e=>status===null||e.status===status).sort((a,b)=>orderValue(a)-orderValue(b)).slice(-limit);}
 async history(chatId,sourceId,targetId,{type=null,limit=100}={}){const all=await this.list(chatId);return all.filter(e=>(!type||e.type===type)&&hasPair(e.participants||[],sourceId,targetId)).sort((a,b)=>orderValue(b)-orderValue(a)).slice(0,limit);}
 async pairStats(chatId,sourceId,targetId){const events=await this.history(chatId,sourceId,targetId,{limit:10000});const byType={};for(const e of events)byType[e.type]=(byType[e.type]||0)+1;return{count:events.length,byType,first:events.at(-1)||null,latest:events[0]||null};}
 async recallForQuery(chatId,query,focusParticipants=[],limit=8){
  // Relevance must come from the event itself; the main character is a participant
  // in almost every event and must not cause all old events to be injected.
  const q=clean(query);
  if(!q)return [];
  const all=await this.list(chatId);
  return all.map(e=>{
    const text=[e.summary,...(e.consequences||[])].join(' ');
    const lexical=lexicalMatch(q,text);
    const score=lexical*.85+Math.min(.15,Number(e.importance||0)*.15);
    return {...e,score,lexical};
  }).filter(e=>hasTopicMatch(q,[e.summary,...(e.consequences||[])].join(' ')))
    .sort((a,b)=>b.score-a.score||orderValue(b)-orderValue(a))
    .slice(0,limit);
 }
 async invalidateForFloor(floorId,reason='evidence_changed'){const all=await this.store.getAll('events');for(const e of all){if(e.status!=='active'||!(e.floorIds||[]).includes(floorId))continue;e.status='invalid';e.invalidReason=reason;e.updatedAt=Date.now();await this.store.put('events',e);}}
 async timeline(chatId,limit=200){return this.list(chatId,{status:null,limit});}
}
