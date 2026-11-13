// Local dev server: builds the Worker, runs it on Node with an in-memory D1 + R2, and fakes the platform sign-in.
// Usage: node scripts/dev.mjs [--port 8787] [--seed] [--persist]
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { D1, Bucket, migrate } from './lib/d1.mjs';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };

export async function startDev({ port = Number(option('port', 8787)), seed = flag('seed'), persist = flag('persist'), build = true, env: extra = {} } = {}) {
  if (build) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Build failed');
  }
  const module = await import(pathToFileURL(join(root, 'dist/server/index.js')).href + '?t=' + Date.now());
  let file = ':memory:';
  if (persist) { mkdirSync(join(root, '.dev'), { recursive: true }); file = join(root, '.dev/local.sqlite'); }
  const d1 = new D1(file);
  const tables = d1.db.prepare("SELECT name FROM sqlite_master WHERE name = 'profiles'").get();
  if (!tables) await migrate(d1, join(root, 'drizzle'));
  const env = { DB: d1, BUCKET: new Bucket(), ADMIN_EMAIL: 'owner@example.com', EDITORIAL_URL: 'bundled:', ANALYTICS_SALT: 'dev', AI_WEBHOOK_SECRET: 'dev-secret', SECURITY_CONTACT: 'mailto:security@example.com', ...extra };
  if (seed) { const { seedDemo } = await import('./seed.mjs'); await seedDemo(d1); }

  // The real platform injects identity headers after ChatGPT sign-in; locally use ?as=<name> once, then a cookie.
  const people = { karim: ['u-karim', 'karim@example.com'], owner: ['u-owner', 'owner@example.com'], admin: ['u-admin', 'admin@example.com'], mod: ['u-mod', 'mod@example.com'], rahim: ['u-rahim', 'rahim@example.com'], nila: ['u-nila', 'nila@example.com'] };
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.pathname === '/signin-with-chatgpt') {
        res.writeHead(302, { Location: url.searchParams.get('return_to') || '/', 'Set-Cookie': 'dev-user=rahim; Path=/; SameSite=Lax' }); return res.end();
      }
      if (url.pathname === '/dev/as') {
        const who = url.searchParams.get('u') || '';
        res.writeHead(302, { Location: url.searchParams.get('to') || '/', 'Set-Cookie': `dev-user=${who}; Path=/; SameSite=Lax${who ? '' : '; Max-Age=0'}` }); return res.end();
      }
      const cookie = /dev-user=(\w+)/.exec(req.headers.cookie || '')?.[1];
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      if (cookie && people[cookie]) { headers.set('oai-authenticated-user-id', people[cookie][0]); headers.set('oai-authenticated-user-email', people[cookie][1]); }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
      const request = new Request(origin + req.url, { method: req.method, headers, body, duplex: 'half' });
      const response = await module.default.fetch(request, env, { waitUntil() {} });
      const out = {};
      response.headers.forEach((value, key) => { out[key] = value; });
      if (response.headers.has('set-cookie')) out['set-cookie'] = response.headers.getSetCookie();
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { console.error(error); res.writeHead(500); res.end('Dev server error'); }
  });
  await new Promise(resolve => server.listen(port, resolve));
  return { server, env, d1, url: `http://localhost:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dev = await startDev({ seed: true, ...(flag('seed') ? {} : {}) });
  console.log(`\nAcademic Admission dev server: ${dev.url}\nSign in as: /dev/as?u=owner|admin|mod|rahim|nila  (sign out: /dev/as?u=)`);
}
