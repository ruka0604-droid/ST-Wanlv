const STOP = new Set(['这个','那个','然后','但是','因为','所以','以及','我们','你们','他们','现在','自己','一个','没有','可以','就是','还是','已经','如果','什么','怎么','觉得','知道','这里','那里']);
function tokens(text){return [...new Set(String(text||'').toLowerCase().split(/[^\p{L}\p{N}_]+/u).map(s=>s.trim()).filter(s=>s.length>1&&!STOP.has(s)))];}
function overlap(a,b){if(!a.length||!b.length)return 0;const bs=new Set(b);return a.filter(x=>bs.has(x)).length/Math.max(1,a.length);}
function recency(memory,now=Date.now()){const t=Number(memory.updatedAt||memory.createdAt||0);if(!t)return 0;const days=Math.max(0,(now-t)/86400000);return Math.exp(-days/45);}
export function scoreMemory(memory,query,opts={}){
  const q=tokens(query), text=tokens(memory.text); const lexical=overlap(q,text);
  const importance=Number(memory.importance)||0, confidence=Number(memory.confidence)||0;
  const entityBoost=opts.entityIds?.length&&memory.entityIds?.length?overlap(opts.entityIds,memory.entityIds):0;
  const recent=recency(memory,opts.now);
  const typeBoost=memory.type==='FACT'?0.08:memory.type==='PRIVATE_COGNITION'?0.035:memory.type==='INFERENCE'?0.02:0;
  const score=Math.min(1,lexical*.50+importance*.18+confidence*.13+(opts.useRecency===false?0:recent*.09)+entityBoost*.10+typeBoost);
  const reasons=[];
  if(lexical>.05)reasons.push(`文本关联 ${Math.round(lexical*100)}%`);
  if(entityBoost>.05)reasons.push('人物/实体相关');
  if(importance>=.7)reasons.push('重要性较高');
  if(confidence>=.8)reasons.push('置信度较高');
  if(recent>=.7)reasons.push('近期仍活跃');
  if(memory.type==='FACT')reasons.push('事实记忆优先');
  return {score,reasons,features:{lexical,importance,confidence,recent,entityBoost}};
}
