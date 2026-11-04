import { setMemoryAIProvider } from '../ai/api-client.js';
import { VERSION, DEFAULT_SETTINGS, VISIBILITY } from './config.js';
import { IndexedDBStore } from '../storage/indexed-db.js';
import { getChatIdentity } from '../identity/chat-identity.js';
import { makeFloor } from '../memory/floor-memory.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { recall, explainRecall } from '../recall/retriever.js';
import { buildRecallPrompt, buildStatePrompt, buildRelationshipPrompt, composePrompt } from '../context/injector.js';
import { extractMemories } from '../ai/extractor.js';
import { WanlvPanel } from '../ui/panel.js';
import { PeopleManager } from '../people.js';
import { KnowledgeManager } from '../knowledge.js';
import { StateEngine } from '../cse/state-engine.js';
import { extractState } from '../ai/state-extractor.js';
import { RelationshipEngine } from '../relationship/relationship-engine.js';
import { extractRelationshipSignals } from '../ai/relationship-extractor.js';
import { TaskQueue } from '../tasks/task-queue.js';
import { runHealthCheck } from '../diagnostics/health.js';
import { EventManager } from '../events/event-manager.js';
import { extractEvents } from '../ai/event-extractor.js';
import { buildEventHistoryPrompt } from '../context/events-prompt.js';
import { MemoryConsolidator } from '../memory/consolidator.js';
import { replayToFloor, replayEvent } from '../timeline/replay.js';

const PROMPT_KEY = 'wanlv_contextual_memory';
const recentText=(chat,n)=>{const count=Number(n);const source=count<=0?chat:chat.slice(-count);return source.map(m=>`[${m?.is_user?'用户':(m?.name||'角色')}] ${m?.mes??m?.content??''}`).join('\n');};

export class WanlvApp{
 constructor(){
  this.version=VERSION; this.store=new IndexedDBStore(); this.memoryManager=new MemoryManager(this.store); this.people=new PeopleManager(this.store); this.knowledge=new KnowledgeManager(this.store); this.stateEngine=new StateEngine(this.store); this.relationshipEngine=new RelationshipEngine(this.store); this.events=new EventManager(this.store); this.consolidator=new MemoryConsolidator(this.store,this.memoryManager);
  this.settings={...DEFAULT_SETTINGS}; this.apiKey=""; this.context=null; this.currentIdentity=null; this.panel=new WanlvPanel(this); this.listeners=[]; this.syncing=false; this.active=false; this.generationEpoch=0;
  this.tasks=new TaskQueue(this.store,{concurrency:1,retryLimit:2,onError:(e)=>this.log('task_error',e)});
 }
 async init(){
  await this.store.open();
  this.context=globalThis.SillyTavern?.getContext?.()||null;
  await this.loadSettings();
  setMemoryAIProvider(this);
  this.registerTaskHandlers();
  await this.tasks.recoverStuck();
  await this.enable();
 }
 async enable(){
  if(this.active&&this.listeners.length)return this;
  this.context=globalThis.SillyTavern?.getContext?.()||this.context;
  this.active=true;
  this.tasks.resume();
  this.bindEvents();
  await this.syncIdentity();
  await this.panel.mount();
  this.panel.updateFloating?.();
  return this;
 }
 bindEvents(){
  const {eventSource}=this.context||{};
  // SillyTavern getContext uses eventTypes (camel case), not event_types.
  const eventTypes=this.context?.eventTypes||this.context?.event_types;
  if(this.listeners.length||!eventSource||!eventTypes)return;
  const on=(name,fn)=>{const event=eventTypes[name];if(event){eventSource.on(event,fn);this.listeners.push([event,fn]);}};
  on('CHAT_CHANGED',async()=>{this.generationEpoch++;this.clearPrompt();await this.syncIdentity();});
  for(const name of ['MESSAGE_RECEIVED','MESSAGE_SENT','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED']){
    on(name,()=>this.reconcileChat());
  }
  on('GENERATION_AFTER_COMMANDS',()=>this.prepareGeneration().catch(e=>{
    this.clearPrompt();this.log('contextual_recall_failed',e);
  }));
  for(const name of ['GENERATION_ENDED','GENERATION_STOPPED']){
    on(name,()=>this.clearPrompt());
  }
 }
 clearPrompt(context=this.context){
  try{context?.setExtensionPrompt?.(PROMPT_KEY,'',-1,0,false,0);}
  catch(error){this.log('prompt_clear_failed',error);}
 }
 async disable(){
  this.active=false;
  this.generationEpoch++;
  this.clearPrompt();
  this.tasks.pause();
  const {eventSource}=this.context||{};
  for(const [event,fn] of this.listeners){
    try{
      if(typeof eventSource?.removeListener==='function')eventSource.removeListener(event,fn);
      else eventSource?.off?.(event,fn);
    }catch(error){this.log('event_cleanup_failed',error);}
  }
  this.listeners=[];
  this.panel.closeFloating?.();
  if(this.panel.float)this.panel.float.hidden=true;
 }
 async registerTaskHandlers(){
  this.tasks.register('memory_extract',async({chatId})=>{if(chatId!==this.currentIdentity?.id)return null;return this.extractRecent({refresh:false});});
  this.tasks.register('state_extract',async({chatId})=>{if(chatId!==this.currentIdentity?.id)return null;return this.extractCurrentState({refresh:false});});
  this.tasks.register('relationship_extract',async({chatId})=>{if(chatId!==this.currentIdentity?.id)return null;return this.extractCurrentRelationship({refresh:false});});
  this.tasks.register('event_extract',async({chatId})=>{if(chatId!==this.currentIdentity?.id)return null;return this.extractEvents({refresh:false});});
 }
 async syncIdentity(){if(!this.active)return;this.context=globalThis.SillyTavern?.getContext?.()||this.context;this.currentIdentity=getChatIdentity(this.context||{});if(this.currentIdentity)await this.store.put('chats',{id:this.currentIdentity.id,...this.currentIdentity,updatedAt:Date.now()});await this.reconcileChat();await this.panel.refresh();}
 async reconcileChat(){if(!this.active||this.syncing||!this.currentIdentity)return;const chat=this.context?.chat;if(!Array.isArray(chat))return;this.syncing=true;try{const chatId=this.currentIdentity.id;const old=await this.store.getByIndex('floors','chatId',chatId);const bySource=new Map(old.map(f=>[f.sourceKey,f]));const seen=new Set();for(let i=0;i<chat.length;i++){const sourceKey=`${chatId}:source:${i}`;seen.add(sourceKey);const previous=bySource.get(sourceKey);const normalized=makeFloor(chatId,chat[i],i,previous?.status==='active'?previous:null);if(!previous||previous.hash!==normalized.hash||previous.status!=='active'){if(previous&&previous.status==='active'){previous.status='superseded';previous.supersededAt=Date.now();previous.supersededBy=normalized.id;await this.store.put('floors',previous);if(this.settings.autoInvalidateStaleEvidence){await this.memoryManager.invalidateForFloor(previous.id,normalized.edited?'message_edited':'source_changed');await this.stateEngine.invalidateForFloor(previous.id,normalized.edited?'message_edited':'source_changed');await this.relationshipEngine.invalidateForFloor(previous.id,normalized.edited?'message_edited':'source_changed');await this.events.invalidateForFloor(previous.id,normalized.edited?'message_edited':'source_changed');}}await this.store.put('floors',normalized);}}
   for(const f of old){if(f.status==='active'&&!seen.has(f.sourceKey)){f.status='deleted';f.deletedAt=Date.now();await this.store.put('floors',f);if(this.settings.autoInvalidateStaleEvidence){await this.memoryManager.invalidateForFloor(f.id,'message_deleted');await this.stateEngine.invalidateForFloor(f.id,'message_deleted');await this.relationshipEngine.invalidateForFloor(f.id,'message_deleted');await this.events.invalidateForFloor(f.id,'message_deleted');}}}
  }finally{this.syncing=false;}}
 async captureCurrentChat(){await this.reconcileChat();return this.currentIdentity?.id||null;}
 async extractRecent({refresh=true}={}){if(!this.currentIdentity)return [];const chat=this.context?.chat;if(!Array.isArray(chat)||!chat.length)return [];try{const recent=recentText(chat,this.settings.taskRecentMessages);const items=await extractMemories(this.context,recent);const floors=await this.store.getByIndex('floors','chatId',this.currentIdentity.id);const active=new Map(floors.filter(f=>f.status==='active').map(f=>[f.messageIndex,f]));for(const item of items){const evidence=(item.evidenceFloorIndexes||[]).map(i=>active.get(i)).filter(Boolean).map(f=>({floorId:f.id,floorKey:f.sourceKey,hash:f.hash,messageIndex:f.messageIndex,revision:f.revision}));const entityIds=[];for(const name of item.entityNames||[]){let e=await this.people.resolve(this.currentIdentity.id,name);if(!e)e=await this.people.upsertEntity({chatId:this.currentIdentity.id,name});if(e)entityIds.push(e.id);}await this.memoryManager.addMemory({chatId:this.currentIdentity.id,type:item.type,text:item.text,visibility:item.visibility||VISIBILITY.UNKNOWN,confidence:item.confidence,importance:item.importance,entityIds,evidence,source:'ai'});}if(refresh)await this.panel.refresh();return items;}catch(e){this.log('memory_extraction_failed',e);this.notify(`万缕：AI整理失败：${e.message}`);throw e;}}
 async consolidateMemories({refresh=true}={}){if(!this.currentIdentity)return null;try{const result=await this.consolidator.consolidateChat(this.context,this.currentIdentity.id,{threshold:this.settings.consolidationThreshold,maxClusterSize:this.settings.maxClusterSize});if(refresh)await this.panel.refresh();this.notify(`万缕：整理完成，合并 ${result.consolidated} 组重复记忆`);return result;}catch(e){this.log('consolidation_failed',e);this.notify(`万缕：记忆合并失败：${e.message}`);throw e;}}
 async extractEvents({refresh=true}={}){if(!this.currentIdentity)return [];const chat=this.context?.chat;if(!Array.isArray(chat)||!chat.length)return [];try{const recent=recentText(chat,this.settings.taskRecentMessages);const items=await extractEvents(this.context,recent,{characterName:this.context?.name2||'当前角色'});const floors=await this.store.getByIndex('floors','chatId',this.currentIdentity.id);const active=new Map(floors.filter(f=>f.status==='active').map(f=>[f.messageIndex,f]));for(const item of items){const evidence=(item.floorIndexes||[]).map(i=>active.get(i)).filter(Boolean);const floorIds=evidence.map(f=>f.id);const participants=[];for(const name of item.participants||[]){const n=String(name).trim();if(!n)continue;participants.push(n);if(n!=='用户'){let e=await this.people.resolve(this.currentIdentity.id,n);if(!e)e=await this.people.upsertEntity({chatId:this.currentIdentity.id,name:n});}}await this.events.addEvent({chatId:this.currentIdentity.id,type:item.type,summary:item.summary,participants,floorIds,floorIndexes:item.floorIndexes,consequences:item.consequences,stateChanges:item.stateChanges,relationshipChanges:item.relationshipChanges,importance:item.importance,source:'ai'});}if(refresh)await this.panel.refresh();return items;}catch(e){this.log('event_extraction_failed',e);this.notify(`万缕：事件整理失败：${e.message}`);throw e;}}
 async organize(options={memory:true,events:true,state:true,relationship:true,consolidate:false,range:'recent'}){
  if(!this.currentIdentity)return {ok:false,reason:'no_chat'};
  const chat=this.context?.chat;
  if(!Array.isArray(chat)||!chat.length)return {ok:false,reason:'empty_chat'};
  const oldN=this.settings.taskRecentMessages;
  const range=options.range??'recent';const rangeN=range==='all'?chat.length:Math.max(1,Number(range)||oldN);
  this.settings.taskRecentMessages=Math.min(chat.length,rangeN);
  const result={range:this.settings.taskRecentMessages,memory:0,events:0,state:0,relationship:null,consolidated:null};
  try{
    await this.captureCurrentChat();
    if(options.memory){const x=await this.extractRecent({refresh:false});result.memory=x.length;}
    if(options.events){const x=await this.extractEvents({refresh:false});result.events=x.length;}
    if(options.state){const x=await this.extractCurrentState({refresh:false});result.state=x.length;}
    if(options.relationship){result.relationship=await this.extractCurrentRelationship({refresh:false});}
    if(options.consolidate){result.consolidated=await this.consolidateMemories({refresh:false});}
    await this.panel.refresh();
    return {ok:true,...result};
  }finally{this.settings.taskRecentMessages=oldN;}
 }
 async replayFloor(floorIndex,options={}){return replayToFloor(this.context,floorIndex,options);}
 async replayEvent(event,options={}){return replayEvent(this.context,event,options);}
 async getEventHistory(sourceId,targetId,options={}){if(!this.currentIdentity)return[];return this.events.history(this.currentIdentity.id,sourceId,targetId,options);}
 async getEventStats(sourceId,targetId){if(!this.currentIdentity)return null;return this.events.pairStats(this.currentIdentity.id,sourceId,targetId);}
 async listTimeline(limit=200){if(!this.currentIdentity)return[];return this.events.timeline(this.currentIdentity.id,limit);}
 async extractCurrentState({refresh=true}={}){if(!this.currentIdentity)return [];const chat=this.context?.chat;if(!Array.isArray(chat)||!chat.length)return [];const subjectId=this.stateEngine.subjectId(this.context,this.currentIdentity.id);try{const changes=await extractState(this.context,recentText(chat,this.settings.taskRecentMessages),this.context?.name2||'当前角色');if(!changes.length)return [];const floors=await this.store.getByIndex('floors','chatId',this.currentIdentity.id);const evidence=floors.filter(f=>f.status==='active'&&f.messageIndex>=Math.max(0,chat.length-this.settings.taskRecentMessages)).map(f=>({floorId:f.id,floorKey:f.sourceKey,hash:f.hash,messageIndex:f.messageIndex,revision:f.revision}));const grouped=new Map();for(const c of changes){const layer=c.layer||'adaptive';if(!grouped.has(layer))grouped.set(layer,[]);grouped.get(layer).push(c);}for(const [layer,items] of grouped)await this.stateEngine.apply({chatId:this.currentIdentity.id,subjectId,layer,changes:items,reason:'AI从最近聊天整理角色状态',evidence,source:'ai',importance:.6});if(refresh)await this.panel.refresh();return changes;}catch(e){this.log('state_extraction_failed',e);this.notify(`万缕：状态整理失败：${e.message}`);throw e;}}
 async getCurrentState(){if(!this.currentIdentity)return null;return this.stateEngine.getSnapshot(this.currentIdentity.id,this.stateEngine.subjectId(this.context,this.currentIdentity.id));}
 relationshipIds(){if(!this.currentIdentity)return null;const sourceId=this.stateEngine.subjectId(this.context,this.currentIdentity.id);return {sourceId,targetId:`player_${this.currentIdentity.id}`};}
 async getCurrentRelationship(){if(!this.currentIdentity)return null;const {sourceId,targetId}=this.relationshipIds();return this.relationshipEngine.snapshot(this.currentIdentity.id,sourceId,targetId);}
 async ensureCurrentRelationship(options={}){if(!this.currentIdentity)return null;const {sourceId,targetId}=this.relationshipIds();return this.relationshipEngine.ensure({chatId:this.currentIdentity.id,sourceId,targetId,...options});}
 async configureCurrentRelationship(options={}){if(!this.currentIdentity)return null;const rel=await this.ensureCurrentRelationship();return this.relationshipEngine.configure(this.currentIdentity.id,rel.id,options);}
 async extractCurrentRelationship({refresh=true}={}){if(!this.currentIdentity)return null;const chat=this.context?.chat;if(!Array.isArray(chat)||!chat.length)return null;const rel=await this.ensureCurrentRelationship();try{const signals=await extractRelationshipSignals(this.context,recentText(chat,this.settings.taskRecentMessages),rel);const floors=await this.store.getByIndex('floors','chatId',this.currentIdentity.id);const evidence=floors.filter(f=>f.status==='active'&&f.messageIndex>=Math.max(0,chat.length-this.settings.taskRecentMessages)).map(f=>({floorId:f.id,floorKey:f.sourceKey,hash:f.hash,messageIndex:f.messageIndex,revision:f.revision}));const result=await this.relationshipEngine.applySignals({chatId:this.currentIdentity.id,relationshipId:rel.id,signals,evidence,source:'ai'});if(refresh)await this.panel.refresh();return result;}catch(e){this.log('relationship_extraction_failed',e);this.notify(`万缕：关系整理失败：${e.message}`);throw e;}}
 async queue(type,priority=0){if(!this.active||!this.currentIdentity)return null;return this.tasks.enqueue({chatId:this.currentIdentity.id,type,priority,dedupeKey:`${type}:${this.currentIdentity.id}:${this.context?.chat?.length||0}`});}
 async prepareGeneration(){
  // Called before prompt assembly, through GENERATION_AFTER_COMMANDS.
  // setExtensionPrompt is ephemeral: it never inserts a synthetic message into the chat log.
  const epoch=++this.generationEpoch;
  this.clearPrompt();
  if(!this.active||!this.settings.enabled||!this.settings.injectEnabled||!this.currentIdentity)return;
  const context=globalThis.SillyTavern?.getContext?.()||this.context;
  if(typeof context?.setExtensionPrompt!=='function'||!Array.isArray(context?.chat))return;
  const chatId=this.currentIdentity.id;
  if(getChatIdentity(context)?.id!==chatId)return;
  const lastMessages=context.chat.slice(-4);
  const query=lastMessages.map(m=>String(m?.mes??m?.content??'').replace(/<[^>]*>/g,' ').slice(0,550)).join('\n').slice(-1400).trim();
  if(!query)return;
  const memories=await recall(this.store,chatId,query,{
    limit:this.settings.recallLimit,
    minScore:this.settings.minRecallScore,
    useRecency:this.settings.recallUseRecency,
    useEntities:this.settings.recallUseEntities
  });
  const [state,relationship,events,stats]=await Promise.all([
    this.getCurrentState(),
    this.getCurrentRelationship(),
    this.events.recallForQuery(chatId,query,['用户',context.name2||'当前角色'],8),
    this.events.pairStats(chatId,'用户',context.name2||'当前角色')
  ]);
  const eventPrompt=buildEventHistoryPrompt(events,{[`用户 ↔ ${context.name2||'当前角色'}`]:stats});
  const prompt=composePrompt([
    buildRecallPrompt(memories),
    eventPrompt,
    buildStatePrompt(state),
    buildRelationshipPrompt(relationship)
  ],this.settings.maxInjectedChars);
  // The user may have disabled the plugin or switched chats during IndexedDB reads.
  if(epoch!==this.generationEpoch||!this.active||!this.settings.enabled||!this.settings.injectEnabled)return;
  if(getChatIdentity(globalThis.SillyTavern?.getContext?.()||context)?.id!==chatId)return;
  context.setExtensionPrompt(PROMPT_KEY,prompt,prompt?1:-1,1,false,0);
  if(prompt){
    await this.store.put('recall_logs',{
      id:`rec_${Date.now()}_${Math.random().toString(36).slice(2)}`,chatId,query,
      memoryIds:memories.map(x=>x.id),scores:explainRecall(memories),createdAt:Date.now(),
      type:'contextual',contextSize:context.maxContext??null
    });
  }
 }
 async loadSettings(){const saved=await this.store.get('settings','global');if(saved?.value)this.settings={...DEFAULT_SETTINGS,...saved.value};}
 async setSetting(key,value){if(key==='apiKey')throw new Error('密钥不写入设置存储');this.settings[key]=value;if(['enabled','injectEnabled'].includes(key)&&!value){this.generationEpoch++;this.clearPrompt();}await this.store.put('settings',{id:'global',value:this.settings,updatedAt:Date.now()});}
 notify(text){globalThis.toastr?.info?.(text,'万缕')||console.info(text);}
 log(type,error){if(this.settings.debugLogs)console.warn(`[万缕:${type}]`,error);}
 async healthCheck(){if(!this.currentIdentity)return {chatId:null,issues:[]};return runHealthCheck(this.store,this.currentIdentity.id);}
 async exportCurrentChat(){if(!this.currentIdentity)return;const id=this.currentIdentity.id;const data={format:'ST-Wanlv',version:VERSION,exportedAt:new Date().toISOString(),chat:await this.store.get('chats',id),floors:await this.store.getByIndex('floors','chatId',id),memories:await this.store.getByIndex('memories','chatId',id),entities:await this.store.getByIndex('entities','chatId',id),aliases:await this.store.getByIndex('aliases','chatId',id),knowledge:await this.store.getByIndex('knowledge','chatId',id),stateDeltas:await this.store.getByIndex('state_deltas','chatId',id),characterStates:await this.store.getByIndex('character_states','chatId',id),relationships:await this.store.getByIndex('relationships','chatId',id),relationshipDeltas:await this.store.getByIndex('relationship_deltas','chatId',id),recallLogs:await this.store.getByIndex('recall_logs','chatId',id),tasks:await this.store.getByIndex('tasks','chatId',id),events:await this.store.getByIndex('events','chatId',id),memoryClusters:await this.store.getByIndex('memory_clusters','chatId',id),memoryVersions:await this.store.getByIndex('memory_versions','chatId',id)};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wanlv-${id}-v${VERSION}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 publicApi(){return {version:VERSION,organize:(options)=>this.organize(options),replayFloor:(floor,options)=>this.replayFloor(floor,options),replayEvent:(event,options)=>this.replayEvent(event,options),getCurrentChatId:()=>this.currentIdentity?.id||null,listMemories:()=>this.currentIdentity?this.memoryManager.listMemories(this.currentIdentity.id):[],capture:()=>this.captureCurrentChat(),extract:()=>this.extractRecent(),queueExtract:()=>this.queue('memory_extract'),queueState:()=>this.queue('state_extract'),queueRelationship:()=>this.queue('relationship_extract'),queueEvents:()=>this.queue('event_extract'),consolidate:()=>this.consolidateMemories(),listTimeline:limit=>this.listTimeline(limit),getEventHistory:(a,b,o)=>this.getEventHistory(a,b,o),getEventStats:(a,b)=>this.getEventStats(a,b),getTasks:()=>this.currentIdentity?this.tasks.list(this.currentIdentity.id):[],getState:()=>this.getCurrentState(),extractState:()=>this.extractCurrentState(),getRelationship:()=>this.getCurrentRelationship(),extractRelationship:()=>this.extractCurrentRelationship(),ensureRelationship:(options)=>this.ensureCurrentRelationship(options),configureRelationship:(options)=>this.configureCurrentRelationship(options),applyState:(args)=>this.currentIdentity?this.stateEngine.apply({chatId:this.currentIdentity.id,subjectId:this.stateEngine.subjectId(this.context,this.currentIdentity.id),...args}):null,setCore:(changes,reason)=>this.currentIdentity?this.stateEngine.setCore(this.currentIdentity.id,this.stateEngine.subjectId(this.context,this.currentIdentity.id),changes,reason):null,recall:q=>this.currentIdentity?recall(this.store,this.currentIdentity.id,q,this.settings):[],healthCheck:()=>this.healthCheck(),open:()=>this.panel.root?.scrollIntoView({behavior:'smooth'})};}
}
