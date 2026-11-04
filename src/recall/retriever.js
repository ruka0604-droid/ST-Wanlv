import { scoreMemory } from './scorer.js';

function escapeText(s,max=1200){return String(s||'').replace(/[\r\n]+/g,' ').slice(0,max);}
function queryEntities(query,entities=[]){
  const q=String(query||'').toLowerCase();
  return entities.filter(e=>q.includes(String(e.name||'').toLowerCase()) || (e.aliases||[]).some(a=>q.includes(String(a).toLowerCase()))).map(e=>e.id);
}

export async function recall(store,chatId,query,{limit=8,minScore=.4,useRecency=true,useEntities=true}={}){
  const [memories,entities]=await Promise.all([
    store.getByIndex('memories','chatId',chatId),
    useEntities?store.getByIndex('entities','chatId',chatId):[]
  ]);
  const entityIds=queryEntities(query,entities);
  // PLAYER_ONLY memories must not become knowledge available to the character.
  return memories.filter(m=>m.status==='active'&&!['SYSTEM_ONLY','PLAYER_ONLY'].includes(m.visibility)).map(m=>{
    const ranked=scoreMemory(m,query,{useRecency,entityIds});
    return {...m,score:ranked.score,reasons:ranked.reasons,features:ranked.features};
  }).filter(m=>m.score>=minScore).sort((a,b)=>b.score-a.score||Number(b.importance||0)-Number(a.importance||0)).slice(0,limit);
}

export function explainRecall(memories){return (memories||[]).map(m=>({id:m.id,score:m.score,reasons:m.reasons||[],features:m.features||{}}));}
