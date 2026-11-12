// ---- Tiny router for /api ----
const routes = [];

function route(method, pattern, handler, options = {}) {
  const keys = [];
  const source = pattern.replace(/:([a-zA-Z]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; });
  routes.push({ method, rx: new RegExp(`^${source}$`), keys, handler, options });
}

function checkOrigin(request, url) {
  required(['POST', 'PUT', 'DELETE'].includes(request.method), 405, 'Method not allowed.');
  const origin = request.headers.get('origin');
  required(origin === url.origin || origin === siteOrigin(url), 403, 'Use the Site to perform this action.');
  const site = request.headers.get('sec-fetch-site');
  required(!site || site === 'same-origin' || site === 'none', 403, 'Use the Site to perform this action.');
}

async function api(request, env, url, user, ctx) {
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  for (const entry of routes) {
    if (entry.method !== method) continue;
    const match = entry.rx.exec(path);
    if (!match) continue;
    if (method !== 'GET' && !entry.options.signed) checkOrigin(request, url);
    const params = {};
    entry.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
    return entry.handler({ request, env, url, user, params, now: Date.now(), id: crypto.randomUUID(), ctx });
  }
  required(!routes.some(entry => entry.rx.test(path)), 405, 'Method not allowed.');
  throw new RequestError(404, 'Not found.');
}

const pathId = (params, name = 'id') => {
  required(isUuid(params[name]), 404, 'Not found.');
  return params[name];
};
