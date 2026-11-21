import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryConsolidator } from '../src/memory/consolidator.js';

const memory=(id,text,floorId,extras={})=>({
  id,chatId:'demo',type:'FACT',visibility:'SHARED',status:'active',
  locked:false,text,evidence:floorId?[{floorId}]:[],...extras
});
async function clusters(rows){
  const store={};
  const manager={listMemories:async()=>rows};
  return new MemoryConsolidator(store,manager).findClusters('demo');
}

test('Chinese paraphrases on the same evidenced floor can form one cluster',async()=>{
  const groups=await clusters([
    memory('a','雨夜两人在桥边接吻','floor-3'),
    memory('b','雨夜两人在桥边亲吻','floor-3')
  ]);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].map(x=>x.id),['a','b']);
});
test('similar wording from separate floors is not the same event',async()=>{
  const groups=await clusters([
    memory('a','两人在花园里接吻','floor-3'),
    memory('b','两人在花园里接吻','floor-9')
  ]);
  assert.equal(groups.length,0);
});
test('first and repeated occurrences stay separate even with shared evidence',async()=>{
  const groups=await clusters([
    memory('a','雨夜里第一次接吻','floor-3'),
    memory('b','雨夜里再次接吻','floor-3')
  ]);
  assert.equal(groups.length,0);
});
test('different fact types and visibility are never mixed',async()=>{
  const groups=await clusters([
    memory('a','两人在花园里接吻','floor-3'),
    memory('b','两人在花园里接吻','floor-3',{type:'INFERENCE'}),
    memory('c','两人在花园里接吻','floor-3',{visibility:'CHARACTER_ONLY'})
  ]);
  assert.equal(groups.length,0);
});
test('missing evidence and locked memories cannot be silently merged',async()=>{
  const groups=await clusters([
    memory('a','雨夜两人在桥边接吻',null),
    memory('b','雨夜两人在桥边接吻',null),
    memory('c','雨夜两人在桥边接吻','floor-3',{locked:true}),
    memory('d','雨夜两人在桥边接吻','floor-3')
  ]);
  assert.equal(groups.length,0);
});
