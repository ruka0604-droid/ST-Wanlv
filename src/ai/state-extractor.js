import { callMemoryAI } from './api-client.js';

export async function extractState(context, recent, subjectName='角色') {
  const prompt = `你是“万缕”的角色状态分析器。只根据聊天正文判断角色当前状态变化，不要编造，不要改变角色卡核心人设。\n目标角色：${subjectName}\n\n严格返回 JSON 对象：{"changes":[...]}。每个 change 格式：{"layer":"adaptive|situational","path":"字段路径","op":"set|merge|delete","value":任意JSON值,"reason":"依据"}。\n规则：\n1. 默认只写 adaptive 或 situational，禁止 core。\n2. 不创建好感度、信任度等数字，除非聊天明确出现并且用户已经在使用数字变量；本阶段默认 mode=none。\n3. adaptive 用于持续形成的倾向、习惯、认知变化。\n4. situational 用于当前情绪、当前目标、当前冲突、当前行为倾向。\n5. 没有足够证据就返回空 changes。\n6. 不要把一次性动作升级成长期人格。\n7. 不要把角色的私密内心当成玩家已知事实。\n\n建议路径示例：\nadaptive.trustTowardPlayer / adaptive.behaviorPatterns / adaptive.emotionalAwareness\nsituational.emotion / situational.attitudeTowardPlayer / situational.currentGoal / situational.conflict\n\n聊天：\n${recent}`;
  const raw = await callMemoryAI(context, prompt);
  const text = String(raw || '').replace(/^```json\s*/, '').replace(/```$/, '').trim();
  let data; try { data = JSON.parse(text); } catch { throw new Error('AI没有返回有效状态JSON'); }
  if (!data || !Array.isArray(data.changes)) return [];
  return data.changes.filter(x => ['adaptive','situational'].includes(x.layer) && x.path && ['set','merge','delete'].includes(x.op || 'set'));
}
