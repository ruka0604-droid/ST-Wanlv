export async function callCurrentSTModel(context, prompt) {
  if (typeof context.generateRaw !== 'function') throw new Error('当前 SillyTavern 未提供 generateRaw API');
  const result = await context.generateRaw({ prompt });
  return typeof result === 'string' ? result : (result?.content ?? result?.text ?? JSON.stringify(result));
}

export async function callMemoryAI(context, prompt) {
  return callCurrentSTModel(context, prompt);
}
