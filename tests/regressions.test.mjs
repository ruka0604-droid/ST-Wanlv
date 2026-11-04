import test from 'node:test';
import assert from 'node:assert/strict';
import { lexicalMatch } from '../src/recall/scorer.js';
import { recall } from '../src/recall/retriever.js';
import { EventManager } from '../src/events/event-manager.js';
import { WanlvApp } from '../src/core/wanlv.js';
import { getChatIdentity } from '../src/identity/chat-identity.js';
import { DEFAULT_SETTINGS } from '../src/core/config.js';

const now=Date.now();
const memories=[
 {id:'m1',chatId:'chat',type:'FACT',text:'她一直珍藏着他送的玉佩',keywords:['玉佩','信物'],source:'consolidated',visibility:'SHARED',status:'active',importance:.9,confidence:.95,updatedAt:now},
 {id:'m2',chatId:'chat',type:'FACT',text:'他们曾在海边看烟花',visibility:'SHARED',status:'active',importance:1,confidence:1,updatedAt:now},
 {id:'m3',chatId:'chat',type:'FACT',text:'玩家独自知道藏宝地点',visibility:'PLAYER_ONLY',status:'active',importance:1,confidence:1,updatedAt:now},
 {id:'m4',chatId:'other',type:'FACT',text:'其他角色赠送的玉佩',visibility:'SHARED',status:'active',importance:1,confidence:1,updatedAt:now}
];

test('中文物品词触发长期/合并记忆，其他话题不会因高重要性被注入', async ()=>{
 assert.ok(lexicalMatch('她摸到了玉佩','她一直珍藏着他送的玉佩')>0);
 const store={getByIndex:async(table,index,id)=>table==='memories'?memories.filter(m=>m.chatId===id):[]};
 const result=await recall(store,'chat','她看着自己的玉佩',{minScore:.4});
 assert.deepEqual(result.map(m=>m.id),['m1']);
 assert.deepEqual(await recall(store,'chat','天气很好，可以去喝咖啡',{minScore:.4}),[]);
});

test('事件召回必须与事件文本相关，不能仅凭共同参与者召回所有历史',async()=>{
 const events=[
  {id:'e1',chatId:'chat',status:'active',summary:'他把玉佩赠给她，约定一直珍惜',participants:['用户','角色'],importance:.9},
  {id:'e2',chatId:'chat',status:'active',summary:'他们在海边看烟花',participants:['用户','角色'],importance:.9}
 ];
 const store={getByIndex:async()=>events};
 const manager=new EventManager(store);
 const found=await manager.recallForQuery('chat','她摸着玉佩',['用户','角色']);
 assert.deepEqual(found.map(e=>e.id),['e1']);
});

test('停用/重新启用不会重复监听；停用清除临时上下文',async()=>{
 const registered=new Map(),injections=[];
 const emitter={
   on(name,fn){if(!registered.has(name))registered.set(name,new Set());registered.get(name).add(fn);},
   removeListener(name,fn){registered.get(name)?.delete(fn);}
 };
 const context={
   eventSource:emitter,
   eventTypes:{CHAT_CHANGED:'changed',MESSAGE_SENT:'sent',GENERATION_AFTER_COMMANDS:'before',GENERATION_ENDED:'end'},
   setExtensionPrompt:(...args)=>injections.push(args)
 };
 globalThis.SillyTavern={getContext:()=>context};
 const app=Object.create(WanlvApp.prototype);
 Object.assign(app,{context,active:false,listeners:[],generationEpoch:0,settings:{...DEFAULT_SETTINGS},
   tasks:{pause(){},resume(){}},panel:{mount:async()=>{},updateFloating(){},closeFloating(){},float:{hidden:false}}
 });
 app.syncIdentity=async()=>{};
 await app.enable();
 assert.equal(registered.get('before')?.size,1);
 await app.disable();
 assert.equal(registered.get('before')?.size,0);
 assert.equal(injections.at(-1)[2],-1);
 assert.equal(app.panel.float.hidden,true);
 await app.enable();
 await app.enable();
 assert.equal(registered.get('before')?.size,1);
});

test('按当前聊天召回并通过 setExtensionPrompt 注入，不改写聊天记录',async()=>{
 const chat=[{is_user:false,mes:'他的旧玉佩还在桌上'},{is_user:true,mes:'她拿起了那枚玉佩'}];
 const calls=[],logs=[];
 const ctx={
  chat,chatId:'test-chat',characterId:'char-a',name1:'玩家',name2:'角色',maxContext:8192,
  setExtensionPrompt:(...args)=>calls.push(args)
 };
 globalThis.SillyTavern={getContext:()=>ctx};
 const app=Object.create(WanlvApp.prototype);
 Object.assign(app,{
  active:true,context:ctx,currentIdentity:getChatIdentity(ctx),generationEpoch:0,
  settings:{...DEFAULT_SETTINGS,recallLimit:8},
  store:{
   getByIndex:async(table)=>table==='memories'?[{...memories[0],chatId:getChatIdentity(ctx).id}]:[],
   put:async(table,value)=>logs.push({table,value})
  },
  events:{recallForQuery:async()=>[],pairStats:async()=>({count:0})},
  getCurrentState:async()=>null,getCurrentRelationship:async()=>null
 });
 const original=JSON.stringify(chat);
 await app.prepareGeneration();
 const injected=calls.filter(c=>c[1]&&c[0]==='wanlv_contextual_memory');
 assert.equal(injected.length,1);
 assert.equal(injected[0][2],1); // in-chat
 assert.match(injected[0][1],/玉佩/);
 assert.equal(JSON.stringify(chat),original);
 assert.ok(logs.some(item=>item.table==='recall_logs'));
});
