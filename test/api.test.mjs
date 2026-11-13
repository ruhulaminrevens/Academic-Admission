import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDev } from '../scripts/dev.mjs';
import { client, sign, uid } from './helpers.mjs';

let dev, base, anon, owner, admin, mod, rahim, nila;
before(async () => {
  dev = await startDev({ port: 0, seed: true, build: false });
  base = dev.url;
  [anon, owner, admin, mod, rahim, nila] = ['', 'owner', 'admin', 'mod', 'rahim', 'nila'].map(w => client(base, w));
});
after(() => dev.close());

test('public pages render server-side with SEO metadata', async () => {
  const home = await anon('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /<link rel="canonical" href="http:\/\/localhost:\d+\/">/);
  assert.match(home.body, /application\/ld\+json/);
  assert.match(home.body, /og:image/);
  assert.match(home.body, /KUET|ভর্তি/);
  const notices = await anon('/notices');
  assert.match(notices.body, /CollectionPage/);
  assert.equal((await anon('/definitely-missing')).status, 404);
  assert.match((await anon('/definitely-missing')).headers.get('x-robots-tag') || '', /noindex/);
  assert.match((await anon('/admin')).headers.get('x-robots-tag') || '', /noindex/);
});
test('security headers are present', async () => {
  const { headers } = await anon('/');
  const csp = headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(?!.*unsafe)/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.ok(headers.get('strict-transport-security'));
  assert.ok(headers.get('permissions-policy'));
});
test('sitemap, robots, rss, ics, manifest', async () => {
  const sitemap = await anon('/sitemap.xml');
  assert.match(sitemap.body, /<urlset/); assert.match(sitemap.body, /\/notice\//); assert.match(sitemap.body, /\/post\/00000000/);
  assert.match((await anon('/robots.txt')).body, /Disallow: \/api\//);
  assert.match((await anon('/feed.xml')).body, /<rss version="2.0"/);
  const list = (await anon('/api/notice')).body.items.find(i => i.deadline);
  const ics = await anon(`/ics/${list.id}.ics`);
  assert.equal(ics.status, 200); assert.match(ics.body, /BEGIN:VEVENT/); assert.ok(ics.body.split('\r\n').every(l => Buffer.byteLength(l) <= 75));
  assert.equal((await anon('/manifest.webmanifest')).status, 200);
  assert.equal((await anon('/.well-known/security.txt')).status, 200);
});
test('write endpoints reject anonymous users and cross-origin requests', async () => {
  assert.equal((await anon('/api/feed', { method: 'POST', body: { title: 'x', body: 'y', topic: 'General' } })).status, 401);
  const evil = await fetch(base + '/api/feed', { method: 'POST', headers: { cookie: 'dev-user=rahim', origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(evil.status, 403);
});
test('role gating: member < moderator < admin < super admin', async () => {
  assert.equal((await rahim('/api/admin/overview')).status, 403);
  assert.equal((await mod('/api/admin/overview')).status, 403);
  assert.equal((await mod('/api/admin/reports')).status, 200);
  assert.equal((await admin('/api/admin/overview')).status, 200);
  assert.equal((await admin('/api/admin/settings')).status, 403);
  assert.equal((await admin('/api/admin/audit')).status, 403);
  assert.equal((await owner('/api/admin/settings')).status, 200);
  assert.equal((await owner('/api/admin/export')).status, 200);
  const session = (await owner('/api/session')).body;
  assert.equal(session.can.owner, true);
});
test('only the Super Admin can change roles, and never their own', async () => {
  assert.equal((await admin(`/api/admin/users/u-rahim`, { method: 'PUT', body: { role: 'admin' } })).status, 403);
  assert.equal((await owner(`/api/admin/users/u-rahim`, { method: 'PUT', body: { role: 'moderator' } })).status, 200);
  assert.equal((await owner(`/api/admin/users/u-rahim`, { method: 'PUT', body: { role: 'member' } })).status, 200);
  assert.equal((await owner(`/api/admin/users/u-owner`, { method: 'PUT', body: { role: 'member' } })).status, 400);
});
test('suspension blocks writing and needs a reason', async () => {
  assert.equal((await admin('/api/admin/users/u-karim', { method: 'PUT', body: { status: 'suspended' } })).status, 400);
  assert.equal((await admin('/api/admin/users/u-karim', { method: 'PUT', body: { status: 'suspended', reason: 'spam' } })).status, 200);
  const karim = client(base, 'karim');
  assert.equal((await karim('/api/feed', { method: 'POST', body: { title: 'ok title', body: 'ok body', topic: 'General' } })).status, 403);
  assert.equal((await admin('/api/admin/users/u-karim', { method: 'PUT', body: { status: 'active' } })).status, 200);
  assert.equal((await karim('/api/feed', { method: 'POST', body: { title: 'ok title', body: 'ok body', topic: 'General' } })).status, 201);
  assert.equal((await admin('/api/admin/users/u-admin', { method: 'PUT', body: { status: 'suspended', reason: 'self' } })).status, 400);
  assert.equal((await mod('/api/admin/users/u-admin', { method: 'PUT', body: { status: 'suspended', reason: 'nope' } })).status, 403);
});
test('community flow: post, comment, react, report, pin, delete', async () => {
  const created = await rahim('/api/feed', { method: 'POST', body: { title: 'প্রশ্ন', body: 'বিস্তারিত', topic: 'Question' } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await nila(`/api/posts/${id}/comments`, { method: 'POST', body: { body: 'উত্তর' } })).status, 201);
  assert.equal((await nila(`/api/posts/${id}/reaction`, { method: 'PUT', body: { kind: 'helpful' } })).status, 200);
  const post = (await nila(`/api/posts/${id}`)).body;
  assert.equal(post.helpful, 1); assert.equal(post.comments, 1); assert.equal(post.myReaction, 'helpful');
  assert.equal((await rahim(`/api/posts/${id}/report`, { method: 'POST', body: { reason: 'spam' } })).status, 400); // own post
  assert.equal((await nila(`/api/posts/${id}/report`, { method: 'POST', body: { reason: 'spam' } })).status, 201);
  assert.equal((await nila(`/api/posts/${id}/report`, { method: 'POST', body: { reason: 'spam' } })).body.duplicate, true);
  assert.equal((await rahim(`/api/posts/${id}/pin`, { method: 'PUT', body: { pinned: true } })).status, 403);
  assert.equal((await mod(`/api/posts/${id}/pin`, { method: 'PUT', body: { pinned: true } })).status, 200);
  assert.equal((await nila(`/api/posts/${id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await rahim(`/api/posts/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await anon(`/api/posts/${id}`)).status, 404);
});
test('admin content publishing feeds the public pages', async () => {
  const bad = await admin('/api/admin/resources', { method: 'POST', body: { section: 'notice', category: 'Admission', title: 'No source', summary: 'missing url' } });
  assert.equal(bad.status, 400);
  const ok = await admin('/api/admin/resources', { method: 'POST', body: { section: 'notice', category: 'Admission', title: 'Admin notice', summary: 'Details', url: 'https://example.com/a', deadline: '2027-01-15', pinned: false } });
  assert.equal(ok.status, 201);
  const list = (await anon('/api/notice')).body.items;
  const mine = list.find(i => i.title === 'Admin notice');
  assert.equal(mine.deadline, '2027-01-15');
  assert.match((await anon(`/notice/${mine.id}`)).body, /NewsArticle/);
});
test('read-only mode blocks member writes but not reads', async () => {
  assert.equal((await owner('/api/admin/settings', { method: 'PUT', body: { readonly: true } })).status, 200);
  const blocked = await rahim('/api/feed', { method: 'POST', body: { title: 'blocked', body: 'blocked', topic: 'General' } });
  assert.equal(blocked.status, 503);
  assert.equal((await anon('/api/feed')).status, 200);
  assert.equal((await owner('/api/admin/settings', { method: 'PUT', body: { readonly: false } })).status, 200);
});
test('settings validation', async () => {
  assert.equal((await owner('/api/admin/settings', { method: 'PUT', body: { announcement_link: 'http://insecure.example' } })).status, 400);
  assert.equal((await owner('/api/admin/settings', { method: 'PUT', body: { nonsense: '1' } })).status, 400);
});
test('analytics ingests humans, skips bots, and reports to admins', async () => {
  await fetch(base + '/api/analytics/hit', { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Test' }, body: JSON.stringify({ path: '/notices', w: 390, lang: 'bn', utm: { source: 'facebook', campaign: 'hsc' } }) });
  const bot = await fetch(base + '/api/analytics/hit', { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'user-agent': 'Googlebot' }, body: JSON.stringify({ path: '/notices' }) });
  assert.equal(bot.status, 204);
  const data = (await admin('/api/admin/analytics?days=7')).body;
  assert.ok(data.totals.views > 0);
  assert.ok(data.campaigns.some(c => c.key === 'hsc'));
  assert.equal((await rahim('/api/admin/analytics')).status, 403);
});
test('hourly AI run webhook verifies HMAC and timestamp', async () => {
  const body = JSON.stringify({ status: 'success', added: 2, updated: 1, removed: 0, sources: 14, model: 'mock', notes: 'test run' });
  const post = (headers) => fetch(base + '/api/hooks/editorial-run', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const now = String(Math.floor(Date.now() / 1000));
  assert.equal((await post({ 'x-timestamp': now, 'x-signature': sign('dev-secret', now, body) })).status, 201);
  assert.equal((await post({ 'x-timestamp': now, 'x-signature': 'sha256=' + sign('dev-secret', now, body) })).status, 201);
  assert.equal((await post({ 'x-timestamp': now, 'x-signature': 'deadbeef' })).status, 401);
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await post({ 'x-timestamp': old, 'x-signature': sign('dev-secret', old, body) })).status, 401);
  const runs = (await admin('/api/admin/ai')).body.runs;
  assert.ok(runs.some(r => r.notes === 'test run'));
});
test('File Desk is private and validates content', async () => {
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const up = await rahim('/api/files', { method: 'POST', raw: true, body: png, headers: { 'content-type': 'image/png', 'x-file-name': 'a.png' } });
  assert.equal(up.status, 201);
  assert.equal((await nila(`/api/files/${up.body.id}`)).status, 404);
  assert.equal((await rahim(`/api/files/${up.body.id}`)).status, 200);
  const fake = await rahim('/api/files', { method: 'POST', raw: true, body: Buffer.from('not a png'), headers: { 'content-type': 'image/png', 'x-file-name': 'b.png' } });
  assert.equal(fake.status, 415);
  assert.equal((await rahim('/api/files', { method: 'POST', raw: true, body: png, headers: { 'content-type': 'text/html', 'x-file-name': 'c.html' } })).status, 415);
});
test('account export and deletion remove personal data', async () => {
  const exported = await nila('/api/account/export');
  assert.equal(exported.status, 200);
  assert.equal((await nila('/api/account', { method: 'DELETE', body: { confirm: 'nope' } })).status, 400);
  assert.equal((await nila('/api/account', { method: 'DELETE', body: { confirm: 'DELETE' } })).status, 200);
  assert.equal((await nila('/api/session')).body.profile, null);
});
test('health endpoint reports schema and feed state', async () => {
  const h = (await anon('/api/health')).body;
  assert.equal(h.ok, true); assert.equal(h.schema, true);
});
test('private legacy archive is Super Admin only', async () => {
  assert.equal((await anon('/private/admission-tracker')).status, 401);
  assert.equal((await admin('/private/admission-tracker')).status, 403);
});

test('admission calendar includes source-backed pilot and keeps application plans private', async () => {
  const calendar = await anon('/api/admissions');
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.length, 3);
  assert.match((await anon('/admissions')).body, /ভর্তি ক্যালেন্ডার/);
  assert.equal((await anon('/api/admission-plans')).status, 401);
  const path = '/api/admission-plans/kuet-2026';
  assert.equal((await rahim(path, { method: 'PUT', body: { stage: 'paid' } })).status, 200);
  assert.equal((await rahim('/api/admission-plans')).body.plans[0].stage, 'paid');
  assert.equal((await admin('/api/admission-plans')).body.plans.length, 0);
  assert.equal((await admin(path, { method: 'DELETE' })).status, 200);
  assert.equal((await rahim('/api/admission-plans')).body.plans.length, 1);
  assert.equal((await rahim('/api/admission-reminders', { method: 'PUT', body: { enabled: true } })).status, 503);
  assert.equal((await anon('/api/hooks/admission-jobs', { method: 'POST' })).status, 401);
});

test('admission review publishes a revision once and keeps the old deadline', async () => {
  const id = 'du-science-2026';
  const { items } = (await admin('/api/admin/admissions')).body;
  const item = items.find(entry => entry.id === id);
  const review = { ...item, end: '2026-11-26T23:59+06:00', evidence: 'Integration-test source correction.' };
  const path = '/api/admin/admissions/' + id;
  assert.equal((await rahim(path, { method: 'POST', body: review })).status, 403);
  assert.equal((await admin(path, { method: 'POST', body: review })).status, 200);
  assert.equal((await admin(path, { method: 'POST', body: review })).status, 409);
  const updated = (await anon('/api/admissions')).body.find(entry => entry.id === id);
  assert.equal(updated.end, review.end);
  assert.equal(updated.history[0].before.end, item.end);
  assert.equal(updated.history[0].after.end, review.end);
});

test('Google login stays off without credentials and rejects an unbound callback', async () => {
  assert.equal((await anon('/api/session')).body.googleEnabled, false);
  assert.equal((await anon('/auth/google')).status, 404);
  const testOrigin = 'https://example.test';
  const { default: worker } = await import('../dist/server/index.js');
  const env = { ...dev.env, SITE_URL: testOrigin, GOOGLE_CLIENT_ID: 'fake', GOOGLE_CLIENT_SECRET: 'fake', GOOGLE_STATE_SECRET: 'test-state' };
  const start = await worker.fetch(new Request(testOrigin + '/auth/google'), env, {});
  assert.equal(start.status, 303);
  const location = new URL(start.headers.get('Location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.match(start.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const callback = await worker.fetch(new Request(testOrigin + '/auth/google/callback?state=wrong&code=test'), env, {});
  assert.equal(callback.headers.get('Location'), '/account?auth=state');
});
