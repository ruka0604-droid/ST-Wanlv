import { hashString } from '../identity/chat-identity.js';

export function normalizeMessage(message,index){
  const text=String(message?.mes??message?.content??'').trim();
  const role=message?.is_user?'user':message?.is_system?'system':'assistant';
  const name=String(message?.name??'');
  return {index,role,name,text,hash:hashString(`${role}|${name}|${text}`)};
}

export function makeFloor(chatId,message,index,previous=null){
  const n=normalizeMessage(message,index); const now=Date.now();
  const sourceKey=`${chatId}:source:${index}`;
  const revision=(previous?.revision||0)+1;
  return {id:`${sourceKey}:r${revision}:${n.hash}`,sourceKey,chatId,messageIndex:index,...n,
    revision,previousId:previous?.id||null,status:'active',createdAt:previous?.createdAt||now,updatedAt:now,
    edited:!!previous && previous.hash!==n.hash,source:'chat'};
}
