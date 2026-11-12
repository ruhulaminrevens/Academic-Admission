import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
// Load the shared (browser + Worker) code the same way the build does: concatenated, `export` stripped.
export function loadShared(names) {
  const dir = root + 'shared/';
  const code = readdirSync(dir).filter(n => n.endsWith('.js')).sort()
    .map(n => readFileSync(dir + n, 'utf8').replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '')).join('\n');
  return new Function(`${code}\nreturn { ${names.join(', ')} };`)();
}

export const editorialFixture = () => JSON.parse(readFileSync(root + 'data/editorial.json', 'utf8'));

export function client(base, who = '') {
  const cookie = who ? `dev-user=${who}` : '';
  return async (path, { method = 'GET', body, headers = {}, raw } = {}) => {
    const init = { method, headers: { ...(cookie && { cookie }), ...headers }, redirect: 'manual' };
    if (method !== 'GET' && method !== 'HEAD') { init.headers.origin = base; init.headers['sec-fetch-site'] = 'same-origin'; }
    if (body !== undefined) { init.body = raw ? body : JSON.stringify(body); if (!raw) init.headers['content-type'] = 'application/json'; }
    const res = await fetch(base + path, init);
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

export const sign = (secret, timestamp, body) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
export const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
