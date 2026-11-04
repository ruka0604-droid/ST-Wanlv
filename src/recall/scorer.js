// Chinese n-grams support object, place, and event keywords in longer summaries.
const STOP = new Set(['这个','那个','然后','但是','因为','所以','以及','我们','你们','他们','现在','自己','一个','没有','可以','就是','还是','已经','如果','什么','怎么','觉得','知道','这里','那里','时候','不是','他的','她的','我的','你的','看看','说着','突然','起来']);
const HAN_STOP = new Set([...('的了是在有我你他她它不把那这而与还等过就也都很会为得地着说想能只来去对又再没到上下一人个')]);

export function tokenizeRecall(text) {
  const tokens = new Set();
  for (const part of (String(text||'').toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu)||[])) {
    if (/^[\p{Script=Han}]+$/u.test(part)) {
      for (const ch of part) if (!HAN_STOP.has(ch)) tokens.add('han1:'+ch);
      for (const size of [2, 3]) {
        for (let i=0;i<=part.length-size;i++) {
          const segment=part.slice(i,i+size);
          if (!STOP.has(segment)) tokens.add('han'+size+':'+segment);
        }
      }
    } else if (part.length>1&&!STOP.has(part)) tokens.add('word:'+part);
  }
  return [...tokens];
}

export function lexicalMatch(query,text) {
  const q=tokenizeRecall(query), t=new Set(tokenizeRecall(text));
  if (!q.length||!t.size) return 0;
  let match=0,total=0;
  for (const word of q) {
    const weight=word.startsWith('han1:')?0.2:1;
    total+=weight;
    if(t.has(word))match+=weight;
  }
  return match/Math.max(1,total);
}

function overlap(a,b){if(!a.length||!b.length)return 0;const bs=new Set(b);return a.filter(x=>bs.has(x)).length/Math.max(1,a.length);}
function recency(memory,now=Date.now()){const t=Number(memory.updatedAt||memory.createdAt||0);if(!t)return 0;const days=Math.max(0,(now-t)/86400000);return Math.exp(-days/45);}
export function scoreMemory(memory,query,opts={}){
  const lexical=lexicalMatch(query,[memory.text,...(memory.keywords||[])].join(' '));
  const importance=Number(memory.importance)||0, confidence=Number(memory.confidence)||0;
  const entityBoost=opts.entityIds?.length&&memory.entityIds?.length?overlap(opts.entityIds,memory.entityIds):0;
  const recent=recency(memory,opts.now);
  const typeBoost=memory.type==='FACT'?0.08:memory.type==='PRIVATE_COGNITION'?0.035:memory.type==='INFERENCE'?0.02:0;
  // Important or recent but unrelated memories must never pass the relevance gate.
  const topical=lexical>0||entityBoost>0;
  const score=topical?Math.min(1,lexical*.50+importance*.18+confidence*.13+(opts.useRecency===false?0:recent*.09)+entityBoost*.10+typeBoost):0;
  const reasons=[];
  if(lexical>.05)reasons.push(`文本关联 ${Math.round(lexical*100)}%`);
  if(entityBoost>.05)reasons.push('人物/实体相关');
  if(importance>=.7)reasons.push('重要性较高');
  if(confidence>=.8)reasons.push('置信度较高');
  if(recent>=.7)reasons.push('近期仍活跃');
  if(memory.type==='FACT')reasons.push('事实记忆优先');
  if(memory.source==='consolidated')reasons.push('已合并整理');
  return {score,reasons,features:{lexical,importance,confidence,recent,entityBoost}};
}
