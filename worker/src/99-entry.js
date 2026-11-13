// ---- Worker entry point ----

function respondError(status, message, url) {
  if (url.pathname.startsWith('/api/')) return json({ error: message }, status);
  return response(errorPage(status, message), 'text/html; charset=utf-8', {
    status, headers: { 'Content-Security-Policy': contentSecurityPolicy(url), 'X-Robots-Tag': 'noindex' },
  });
}

function failure(error, url) {
  if (error instanceof RequestError) return respondError(error.status, error.message, url);
  const message = String(error?.message || '');
  if (/no such (table|column)/i.test(message)) return respondError(503, 'Database upgrade pending. Apply the latest migration, then retry.', url);
  console.error('Request failed', url.pathname, error?.name, message.slice(0, 200));
  return respondError(500, 'Temporarily unavailable. Please try again.', url);
}

export default {
  async fetch(request, env, ctx) {
    ENV = env;
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      const auth = path.startsWith('/auth/') ? await googleFlow(env, request, url) : null;
      if (auth) return auth;
      if (path.startsWith('/api/')) return await api(request, env, url, await identify(env, request), ctx);
      required(request.method === 'GET' || request.method === 'HEAD', 405, 'Method not allowed.');
      const asset = staticRoute(path);
      if (asset) return asset;
      const generated = await dynamicPublic(path, env, url);
      if (generated) return generated;
      if (path === '/private/admission-tracker') {
        need(await identify(env, request), 3, 'Super Admin access required.');
        required(assets.legacy, 404, 'Archive unavailable.');
        return response(assets.legacy, 'text/html; charset=utf-8', { headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
      }
      return await renderPage(request, env, url);
    } catch (error) {
      return failure(error, url);
    }
  },
};
