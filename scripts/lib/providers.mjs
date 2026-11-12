// LLM adapters for the hourly editorial run. All providers return the same JSON shape:
// { title, summary, category, deadline } — the pipeline then verifies every claim against the source text.
const SYSTEM = `You write short Bangla summaries of official education notices from Bangladesh.
Rules: use ONLY facts present in the provided page text. Never invent or round dates, numbers, fees or names.
If the text is not an admission/exam/holiday/official notice, set "relevant" to false.
Reply with one JSON object: {"relevant": boolean, "title": string (<=140 chars, keep original wording), "summary": string (Bangla, <=320 chars, 1-3 sentences),
"category": "Admission"|"Exam"|"Holiday"|"Official"|"Breaking", "deadline": "YYYY-MM-DD" or null (only if an explicit application deadline is written)}.`;

const userPrompt = ({ title, text, source }) => `Source: ${source}\nLink text: ${title}\n\nPage text:\n${text}`;

function parseJson(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Provider returned no JSON');
  return JSON.parse(match[0]);
}

async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}`);
  return res.json();
}

export function makeProvider(name = process.env.AI_PROVIDER || 'mock', env = process.env) {
  if (name === 'openai') {
    const key = env.OPENAI_API_KEY, model = env.AI_MODEL || 'gpt-4o-mini';
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    return { name: 'openai:' + model, async summarize(input) {
      const data = await post('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${key}` },
        { model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(input) }] });
      return parseJson(data.choices[0].message.content);
    } };
  }
  if (name === 'anthropic') {
    const key = env.ANTHROPIC_API_KEY, model = env.AI_MODEL || 'claude-haiku-5-5';
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    return { name: 'anthropic:' + model, async summarize(input) {
      const data = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: 700, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: userPrompt(input) }] });
      return parseJson(data.content.map(part => part.text || '').join(''));
    } };
  }
  if (name === 'mock') {
    // Deterministic offline provider for tests and dry runs: echoes the first sentences of the page.
    return { name: 'mock', async summarize({ title, text }) {
      const sentences = text.split(/(?<=[।.!?])\s+/).filter(s => s.length > 20).slice(0, 2).join(' ');
      return { relevant: Boolean(sentences), title, summary: sentences.slice(0, 320), category: 'Admission', deadline: null };
    } };
  }
  throw new Error(`Unknown AI_PROVIDER: ${name}`);
}
