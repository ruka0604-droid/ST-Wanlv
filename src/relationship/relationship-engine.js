import { createRelationshipDelta, RELATIONSHIP_MODES } from './relationship-delta.js';
import { emptyRelationship, replayRelationshipDeltas } from './replay.js';

const STAGES=['陌生','认识','朋友','亲密朋友','暧昧','恋人','稳定伴侣'];
function clone(v){return structuredClone(v);}
function relationId(chatId,sourceId,targetId){return `rel_${chatId}_${sourceId}_${targetId}`;}
function normalizePath(path){return String(path||'').replace(/^relationship\./,'');}

export class RelationshipEngine{
  constructor(store){this.store=store;}
  id(chatId,sourceId,targetId){return relationId(chatId,sourceId,targetId);}
  async get(chatId,sourceId,targetId){return this.store.get('relationships',this.id(chatId,sourceId,targetId));}
  async ensure({chatId,sourceId,targetId,type='custom',mode='qualitative',stage=null,traits={},variables={},rules={},noRegression=true}){
    const id=this.id(chatId,sourceId,targetId);let rel=await this.store.get('relationships',id);
    if(rel)return rel;
    rel={id,chatId,sourceId,targetId,type,mode:mode===RELATIONSHIP_MODES.NUMERIC?mode:RELATIONSHIP_MODES.QUALITATIVE,stage,traits:{...traits},variables:mode===RELATIONSHIP_MODES.NUMERIC?{...variables}: {},rules:{...rules,noRegression},base:{stage,traits:{...traits},variables:mode===RELATIONSHIP_MODES.NUMERIC?{...variables}:{}},history:[],locked:false,createdAt:Date.now(),updatedAt:Date.now()};
    await this.store.put('relationships',rel);return rel;
  }
  async list(chatId){return this.store.getByIndex('relationships','chatId',chatId);}
  async listDeltas(chatId,relationshipId){const all=await this.store.getByIndex('relationship_deltas','chatId',chatId);return all.filter(x=>x.relationshipId===relationshipId);}
  async snapshot(chatId,sourceId,targetId){const rel=await this.get(chatId,sourceId,targetId);if(!rel)return null;const deltas=await this.listDeltas(chatId,rel.id);const replay=replayRelationshipDeltas(deltas,rel.base||emptyRelationship());return {...rel,stage:replay.stage??rel.stage,traits:replay.traits||{},variables:rel.mode==='numeric'?(replay.variables||{}):{},_replayedAt:Date.now()};}
  async apply({chatId,relationshipId,changes=[],reason='',evidence=[],source='manual',importance=.5,signal=null}){
    const rel=await this.store.get('relationships',relationshipId);if(!rel)throw new Error('关系不存在');
    if(rel.locked&&source!=='manual')throw new Error('关系已锁定');
    const safe=[];
    for(const c of changes){const path=normalizePath(c.path);if(path.startsWith('variables.')&&rel.mode!=='numeric')continue;if(path==='stage'&&rel.rules?.noRegression&&c.op==='set'&&rel.stage&&c.value){const a=STAGES.indexOf(rel.stage),b=STAGES.indexOf(c.value);if(a>=0&&b>=0&&b<a)continue;}safe.push({...c,path});}
    if(!safe.length)return rel;
    const delta=createRelationshipDelta({chatId,relationshipId,changes:safe,reason,evidence,source,importance,signal});
    await this.store.put('relationship_deltas',delta);await this.rebuild(chatId,relationshipId);return this.store.get('relationships',relationshipId);
  }
  async rebuild(chatId,relationshipId){const rel=await this.store.get('relationships',relationshipId);if(!rel)return null;const deltas=await this.listDeltas(chatId,relationshipId);const state=replayRelationshipDeltas(deltas,rel.base||emptyRelationship());rel.stage=state.stage??null;rel.traits=state.traits||{};rel.variables=rel.mode==='numeric'?(state.variables||{}):{};rel.updatedAt=Date.now();rel.history=deltas.filter(d=>d.status==='active').slice(-100).map(d=>({id:d.id,reason:d.reason,signal:d.signal,createdAt:d.createdAt}));await this.store.put('relationships',rel);return rel;}
  async invalidateForFloor(floorId,reason='evidence_changed'){const all=await this.store.getAll('relationship_deltas');for(const d of all){if(d.status!=='active'||!d.evidence?.some(e=>e.floorId===floorId))continue;d.status='invalid';d.invalidReason=reason;d.updatedAt=Date.now();await this.store.put('relationship_deltas',d);await this.rebuild(d.chatId,d.relationshipId);}}
  async configure(chatId,relationshipId,{type,mode,stage,traits,variables,rules,noRegression}={}){const rel=await this.store.get('relationships',relationshipId);if(!rel)throw new Error('关系不存在');if(type)rel.type=type;if(mode)rel.mode=mode===RELATIONSHIP_MODES.NUMERIC?'numeric':'qualitative';if(stage!==undefined)rel.stage=stage;if(traits)rel.traits={...rel.traits,...traits};if(rel.mode==='numeric'&&variables)rel.variables={...rel.variables,...variables};if(rel.mode==='qualitative')rel.variables={};if(rules)rel.rules={...(rel.rules||{}),...rules};if(noRegression!==undefined){rel.rules=rel.rules||{};rel.rules.noRegression=!!noRegression;}rel.updatedAt=Date.now();await this.store.put('relationships',rel);return rel;}
  async setMode(chatId,relationshipId,mode){const rel=await this.store.get('relationships',relationshipId);if(!rel)throw new Error('关系不存在');rel.mode=mode===RELATIONSHIP_MODES.NUMERIC?'numeric':'qualitative';if(rel.mode==='qualitative')rel.variables={};rel.updatedAt=Date.now();await this.store.put('relationships',rel);return rel;}
  async lock(chatId,relationshipId,locked=true){const rel=await this.store.get('relationships',relationshipId);if(!rel)return null;rel.locked=locked;rel.updatedAt=Date.now();await this.store.put('relationships',rel);return rel;}
  async applySignals({chatId,relationshipId,signals=[],evidence=[],source='ai'}){
    const rel=await this.store.get('relationships',relationshipId);if(!rel)return null;for(const signal of signals){const rule=this.matchRule(rel,signal);if(!rule)continue;const changes=rule.changes.map(c=>({...c,path:normalizePath(c.path)}));await this.apply({chatId,relationshipId,changes,reason:rule.reason||signal.reason||signal.type||'关系事件',evidence,source,importance:signal.importance??.5,signal});}return this.rebuild(chatId,relationshipId);}
  matchRule(rel,signal){const rules=rel.rules?.signals||{};const candidates=Array.isArray(rules)?rules:[rules[signal.type]];return candidates.find(Boolean)||null;}
  stageIndex(stage){return STAGES.indexOf(stage);}
  stages(){return [...STAGES];}
}
