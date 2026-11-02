import { VISIBILITY } from './core/config.js';
export class KnowledgeManager{
  constructor(store){this.store=store;}
  async set(memoryId,chatId,visibility,subject='current_character'){
    if(!Object.values(VISIBILITY).includes(visibility)) throw new Error('Unknown visibility');
    const id=`kn_${memoryId}_${subject}`;const row={id,memoryId,chatId,subject,visibility,updatedAt:Date.now()};await this.store.put('knowledge',row);return row;
  }
  async get(memoryId,subject='current_character'){return this.store.get('knowledge',`kn_${memoryId}_${subject}`);}
}
