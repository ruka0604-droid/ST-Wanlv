export function buildExtractionPrompt({ recentText }) {
  return `你是“万缕”记忆整理器。只根据给定聊天内容提取长期有价值的信息，不要编造。\n\n严格输出 JSON 数组，每项格式：{"type":"FACT|INFERENCE|BELIEF|PRIVATE_COGNITION","text":"...","confidence":0-1,"importance":0-1,"visibility":"PLAYER_ONLY|CHARACTER_ONLY|SHARED|UNKNOWN"}\n\n规则：\n1. FACT：聊天中明确发生或明确说出的事实。\n2. INFERENCE：由事实合理推断，但不是原文明确陈述。\n3. BELIEF：某个角色相信/误解/主观认知的内容，不等同于客观事实。\n4. PRIVATE_COGNITION：角色不应默认让其他角色知道的内心想法。\n5. 普通闲聊、一次性动作、重复信息不要提取。\n6. 不要改变角色核心人设。\n\n聊天内容：\n${recentText}`;
}
