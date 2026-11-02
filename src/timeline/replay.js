function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

export async function replayToFloor(context, floorIndex, {maxLoads=12, highlight=true}={}){
  const target=Number(floorIndex);
  if(!Number.isInteger(target)||target<0) return {ok:false,reason:'invalid_floor'};
  const ctx=context||globalThis.SillyTavern?.getContext?.();
  const chat=ctx?.chat;
  if(!Array.isArray(chat)||target>=chat.length) return {ok:false,reason:'floor_not_found'};
  const selectorId=String(target).replace(/"/g,'\\"');
  const find=()=>document.querySelector(`#chat .mes[mesid="${selectorId}"]`)||document.querySelector(`#chat .mes[data-mesid="${selectorId}"]`);
  let node=find();
  let loads=0;
  while(!node && loads<maxLoads){
    const loader=document.querySelector('#show_more_messages');
    if(!loader) break;
    try{
      if(typeof ctx?.showMoreMessages==='function') await ctx.showMoreMessages();
      else loader.click();
    }catch{loader.click();}
    loads++;
    await sleep(100);
    node=find();
  }
  if(!node) return {ok:false,reason:'floor_not_rendered',loads};
  node.scrollIntoView({behavior:'smooth',block:'center'});
  if(highlight){
    node.classList.add('wanlv-replay-highlight');
    setTimeout(()=>node.classList.remove('wanlv-replay-highlight'),2200);
  }
  return {ok:true,floorIndex:target,loads};
}

export async function replayEvent(context,event,options={}){
  const floors=(event?.floorIndexes||[]).filter(Number.isInteger).sort((a,b)=>a-b);
  if(!floors.length) return {ok:false,reason:'event_has_no_floor'};
  return replayToFloor(context,floors[0],options);
}
