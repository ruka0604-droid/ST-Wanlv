function safe(v) { return v == null ? '' : String(v); }

export function getChatIdentity(context) {
  const chatId = safe(context.chatId || context.chat_id || context.chatFileName || context.chatName);
  const characterId = safe(context.characterId || context.character_id || context.this_chid);
  const name1 = safe(context.name1 || context.userName || context.user_name);
  const name2 = safe(context.name2 || context.characterName || context.character_name);
  const base = [characterId, chatId, name1, name2].join('::') || 'unknown';
  return {
    id: hashString(base),
    raw: base,
    chatId,
    characterId,
    userName: name1,
    characterName: name2,
  };
}

export function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `wlv_${(h >>> 0).toString(16)}`;
}
