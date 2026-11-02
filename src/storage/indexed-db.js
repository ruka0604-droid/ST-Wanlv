import { DB_NAME, DB_VERSION } from '../core/config.js';

export class IndexedDBStore {
  constructor(){this.db=null;}
  async open(){
    if(this.db) return this.db;
    this.db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const stores=['chats','floors','memories','entities','aliases','state_deltas','character_states','relationships','relationship_deltas','knowledge','recall_logs','tasks','events','memory_clusters','memory_versions','settings'];
        for(const name of stores) if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'});
        const tx=req.transaction;
        const add=(store,index,key,multi=false)=>{const s=tx.objectStore(store);if(!s.indexNames.contains(index))s.createIndex(index,key,{unique:false,multiEntry:multi});};
        add('floors','chatId','chatId'); add('floors','messageIndex','messageIndex'); add('floors','status','status'); add('floors','sourceKey','sourceKey');
        add('memories','chatId','chatId'); add('memories','floorId','floorId'); add('memories','type','type'); add('memories','status','status'); add('memories','entityIds','entityIds',true);
        add('entities','chatId','chatId'); add('entities','name','name'); add('aliases','chatId','chatId'); add('aliases','entityId','entityId');
        add('knowledge','chatId','chatId'); add('knowledge','memoryId','memoryId'); add('recall_logs','chatId','chatId');
        add('state_deltas','chatId','chatId'); add('state_deltas','subjectId','subjectId'); add('state_deltas','status','status'); add('character_states','chatId','chatId'); add('character_states','subjectId','subjectId');
        add('relationships','chatId','chatId'); add('relationships','sourceId','sourceId'); add('relationships','targetId','targetId'); add('relationship_deltas','chatId','chatId'); add('relationship_deltas','relationshipId','relationshipId'); add('relationship_deltas','status','status');
        add('tasks','chatId','chatId'); add('tasks','status','status'); add('tasks','type','type'); add('tasks','dedupeKey','dedupeKey'); add('events','chatId','chatId'); add('events','type','type'); add('events','status','status'); add('events','participants','participants',true);
      };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    return this.db;
  }
  async put(storeName,value){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).put(value);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error);});}
  async putMany(storeName,values){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(storeName,'readwrite');const s=tx.objectStore(storeName);for(const v of values)s.put(v);tx.oncomplete=()=>res(values);tx.onerror=()=>rej(tx.error);});}
  async get(storeName,id){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction(storeName).objectStore(storeName).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async delete(storeName,id){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async getByIndex(storeName,indexName,value){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction(storeName).objectStore(storeName).index(indexName).getAll(value);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
  async getAll(storeName){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction(storeName).objectStore(storeName).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
  async clearStore(storeName){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
}
