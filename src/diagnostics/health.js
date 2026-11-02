export async function runHealthCheck(store,chatId){
 const issues=[]; if(!chatId)return {chatId:null,issues:[],summary:{}};
 const [floors,memories,stateDeltas,relDeltas,tasks]=await Promise.all([
  store.getByIndex('floors','chatId',chatId),store.getByIndex('memories','chatId',chatId),store.getByIndex('state_deltas','chatId',chatId),store.getByIndex('relationship_deltas','chatId',chatId),store.getByIndex('tasks','chatId',chatId)
 ]);
 const activeFloorIds=new Set(floors.filter(f=>f.status==='active').map(f=>f.id));
 for(const m of memories.filter(x=>x.status==='active')) if(m.evidence?.length&&!m.evidence.some(e=>activeFloorIds.has(e.floorId))) issues.push({type:'stale_memory',id:m.id,text:m.text});
 for(const d of stateDeltas.filter(x=>x.status==='active')) if(d.evidence?.length&&!d.evidence.some(e=>activeFloorIds.has(e.floorId))) issues.push({type:'stale_state_delta',id:d.id});
 for(const d of relDeltas.filter(x=>x.status==='active')) if(d.evidence?.length&&!d.evidence.some(e=>activeFloorIds.has(e.floorId))) issues.push({type:'stale_relationship_delta',id:d.id});
 const seen=new Map();for(const m of memories.filter(x=>x.status==='active')){const k=String(m.text||'').trim().toLowerCase();if(k&&seen.has(k))issues.push({type:'duplicate_memory',id:m.id,duplicateOf:seen.get(k)});else if(k)seen.set(k,m.id);}
 const failed=tasks.filter(t=>t.status==='failed').length; if(failed)issues.push({type:'failed_tasks',count:failed});
 return {chatId,floors:floors.length,memories:memories.filter(x=>x.status==='active').length,stateDeltas:stateDeltas.filter(x=>x.status==='active').length,relationshipDeltas:relDeltas.filter(x=>x.status==='active').length,tasks:tasks.length,issues,summary:{stale:issues.filter(x=>x.type.includes('stale')).length,duplicates:issues.filter(x=>x.type==='duplicate_memory').length,failedTasks:failed}};
}
