import { hashString } from './identity/chat-identity.js';

export class PeopleManager{
  constructor(store){this.store=store;}
  async upsertEntity({chatId,name,type='PERSON',aliases=[],description=''}){
    const clean=String(name||'').trim(); if(!clean)return null;
    const id=`ent_${hashString(`${chatId}|${clean.toLowerCase()}`)}`;
    const old=await this.store.get('entities',id); const entity={id,chatId,name:clean,type,aliases:[...new Set([...(old?.aliases||[]),...aliases].map(String).filter(Boolean))],description:description||old?.description||'',updatedAt:Date.now(),createdAt:old?.createdAt||Date.now()};
    await this.store.put('entities',entity);
    for(const alias of entity.aliases) await this.addAlias(chatId,id,alias);
    return entity;
  }
  async addAlias(chatId,entityId,alias){const a=String(alias||'').trim();if(!a)return null;const id=`als_${hashString(`${chatId}|${a.toLowerCase()}`)}`;const row={id,chatId,entityId,alias:a,updatedAt:Date.now()};await this.store.put('aliases',row);return row;}
  async list(chatId){return this.store.getByIndex('entities','chatId',chatId);}
  async resolve(chatId,name){const q=String(name||'').trim().toLowerCase();if(!q)return null;const es=await this.list(chatId);const direct=es.find(e=>e.name.toLowerCase()===q);if(direct)return direct;for(const e of es)if((e.aliases||[]).some(a=>a.toLowerCase()===q))return e;return null;}
}
