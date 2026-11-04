import { MEMORY_TYPES, VISIBILITY } from '../core/config.js';
import { hashString } from '../identity/chat-identity.js';

export class MemoryManager{
  constructor(store){this.store=store;}
  async captureFloor(chatId,floor){await this.store.put('floors',floor);return floor;}
  async addMemory({chatId,floorId=null,type,text,visibility=VISIBILITY.SHARED,confidence=.7,importance=.5,entityIds=[],keywords=[],locked=false,evidence=[],source='ai'}){
    if(!Object.values(MEMORY_TYPES).includes(type))throw new Error(`Unknown memory type: ${type}`);
    const clean=String(text||'').trim();if(!clean)return null;const now=Date.now();
    const id=`mem_${hashString(`${chatId}|${floorId||''}|${type}|${clean}`)}`;
    const old=await this.store.get('memories',id);
    const memory={id,chatId,floorId,type,text:clean,visibility,confidence:clamp(confidence),importance:clamp(importance),entityIds:[...new Set(entityIds)],keywords:[...new Set([...(old?.keywords||[]),...keywords].map(x=>String(x).trim()).filter(Boolean))].slice(0,16),evidence,locked:old?.locked??locked,status:old?.status||'active',source,createdAt:old?.createdAt||now,updatedAt:now};
    await this.store.put('memories',memory);return memory;
  }
  async listMemories(chatId){const rows=await this.store.getByIndex('memories','chatId',chatId);return rows.filter(x=>x.status==='active');}
  async deleteMemory(id){return this.store.delete('memories',id);}
  async archiveMemory(id,reason='superseded'){const m=await this.store.get('memories',id);if(!m)return null;if(m.locked)return m;m.status='superseded';m.supersededReason=reason;m.updatedAt=Date.now();return this.store.put('memories',m);}
  async lockMemory(id,locked=true){const item=await this.store.get('memories',id);if(!item)return null;item.locked=locked;item.updatedAt=Date.now();return this.store.put('memories',item);}
  async invalidateForFloor(floorId,reason='source_changed'){
    const rows=await this.store.getByIndex('memories','floorId',floorId);
    for(const m of rows){if(m.locked)continue;m.status='stale';m.staleReason=reason;m.updatedAt=Date.now();await this.store.put('memories',m);}
    const all=await this.store.getAll('memories');
    for(const m of all){if(m.locked||m.status!=='active'||rows.some(x=>x.id===m.id))continue;if((m.evidence||[]).some(e=>e.floorId===floorId)){m.status='stale';m.staleReason=reason;m.updatedAt=Date.now();await this.store.put('memories',m);}}
  }
  async invalidateEvidence(evidenceKey,reason='evidence_invalid'){
    const all=await this.store.getAll('memories');
    for(const m of all){if(m.locked||m.status!=='active')continue;if((m.evidence||[]).some(e=>e.floorKey===evidenceKey||e.floorId===evidenceKey)){m.status='stale';m.staleReason=reason;m.updatedAt=Date.now();await this.store.put('memories',m);}}
  }
}
function clamp(n){return Math.max(0,Math.min(1,Number(n)||0));}
