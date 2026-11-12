// ---- First-party, cookie-less analytics and the hourly AI workflow endpoints ----

const hitBuckets = new Map();
const botPattern = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|lighthouse|pingdom|uptime/i;
const staticAnalyticsPaths = new Set(['/', '/notices', '/study', '/community', '/about', '/privacy', '/terms', '/account']);

async function analyticsTarget(env, raw) {
  const path = String(raw || '').split(/[?#]/)[0].slice(0, 120);
  if (staticAnalyticsPaths.has(path)) return { path };
  let match = path.match(/^\/notice\/([a-z0-9][a-z0-9-]{0,89})$/);
  if (match) return (await findNotice(env, match[1])) ? { path: '/notice/' + match[1] } : null;
  match = path.match(/^\/post\/([a-f0-9-]{36})$/);
  if (match && isUuid(match[1])) return { path: '/post/:id', post: match[1] };
  return null;
}

const tag = (value, max = 40) => {
  const text = String(value || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, max);
  return text || '';
};

route('POST', '/api/analytics/hit', async c => {
  const ua = c.request.headers.get('user-agent') || '';
  if (botPattern.test(ua)) return noContent();
  const data = await input(c.request, 2000);
  const target = await analyticsTarget(c.env, data.path);
  if (!target) return noContent();
  const day = dhakaDay(c.now);
  const ip = c.request.headers.get('cf-connecting-ip') || (c.request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const visitor = (await sha256Hex(`${c.env.ANALYTICS_SALT || 'aa'}|${day}|${ip}|${ua}`)).slice(0, 32);
  const bucket = hitBuckets.get(visitor) || { count: 0, reset: c.now + 60000 };
  if (c.now > bucket.reset) { bucket.count = 0; bucket.reset = c.now + 60000; }
  bucket.count++;
  hitBuckets.set(visitor, bucket);
  if (hitBuckets.size > 5000) hitBuckets.clear();
  if (bucket.count > 90) return noContent();

  const statements = [
    db(c.env, 'INSERT INTO analytics_daily(day, path, views) VALUES(?,?,1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1', day, target.path),
    db(c.env, 'INSERT OR IGNORE INTO analytics_seen(day, visitor) VALUES(?,?)', day, visitor),
  ];
  const dim = (kind, key) => { if (key) statements.push(db(c.env, 'INSERT INTO analytics_dims(day, kind, key, views) VALUES(?,?,?,1) ON CONFLICT(day, kind, key) DO UPDATE SET views = views + 1', day, kind, key)); };
  let referrer = 'direct';
  try {
    const host = new URL(String(data.ref || '')).hostname.replace(/^www\./, '').slice(0, 60);
    if (host && host !== c.url.hostname) referrer = host;
  } catch { /* direct */ }
  const width = Number(data.w) || 0;
  dim('ref', referrer);
  dim('device', width && width < 640 ? 'mobile' : width && width < 1100 ? 'tablet' : 'desktop');
  dim('lang', tag(String(data.lang || '').slice(0, 2), 2));
  dim('country', tag(c.request.headers.get('cf-ipcountry') || '', 2));
  if (data.utm && typeof data.utm === 'object') {
    dim('utm_source', tag(data.utm.source));
    dim('utm_medium', tag(data.utm.medium));
    dim('utm_campaign', tag(data.utm.campaign));
  }
  if (target.post) statements.push(db(c.env, 'UPDATE posts SET views = views + 1 WHERE id = ?', target.post));
  await c.env.DB.batch(statements);
  if (Math.random() < 0.02) {
    await db(c.env, 'DELETE FROM analytics_seen WHERE day < ?', dhakaDay(c.now - 2 * 86400000)).run();
    await db(c.env, 'DELETE FROM analytics_daily WHERE day < ?', dhakaDay(c.now - 400 * 86400000)).run();
    await db(c.env, 'DELETE FROM analytics_dims WHERE day < ?', dhakaDay(c.now - 400 * 86400000)).run();
  }
  return noContent();
});

route('GET', '/api/admin/analytics', async c => {
  need(c.user, 2);
  const days = Math.min(90, Math.max(7, Number(c.url.searchParams.get('days')) || 30));
  const list = lastDays(days);
  const from = list[0];
  const [views, visitors, paths, dims, posts] = await Promise.all([
    rows(c.env, 'SELECT day, SUM(views) AS n FROM analytics_daily WHERE day >= ? GROUP BY day', from),
    rows(c.env, 'SELECT day, COUNT(*) AS n FROM analytics_seen WHERE day >= ? GROUP BY day', from),
    rows(c.env, 'SELECT path, SUM(views) AS views FROM analytics_daily WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 12', from),
    rows(c.env, 'SELECT kind, key, SUM(views) AS views FROM analytics_dims WHERE day >= ? GROUP BY kind, key ORDER BY views DESC', from),
    rows(c.env, 'SELECT id, title, views FROM posts WHERE views > 0 ORDER BY views DESC LIMIT 6'),
  ]);
  const map = rowsList => Object.fromEntries(rowsList.map(row => [row.day, row.n]));
  const [v, u] = [views, visitors].map(map);
  const group = kind => dims.filter(row => row.kind === kind).slice(0, 8).map(row => ({ key: row.key, views: row.views }));
  return json({
    days, totals: { views: views.reduce((sum, row) => sum + row.n, 0), visitorDays: visitors.reduce((sum, row) => sum + row.n, 0) },
    series: list.map(day => ({ day, views: v[day] || 0, visitors: u[day] || 0 })),
    paths, referrers: group('ref'), devices: group('device'), countries: group('country'), languages: group('lang'),
    campaigns: group('utm_campaign'), sources: group('utm_source'), mediums: group('utm_medium'), posts,
  });
});

// ---------- hourly AI editorial workflow ----------

route('GET', '/api/admin/ai', async c => {
  need(c.user, 2);
  const [feedState, runs] = await Promise.all([editorial(c.env), rows(c.env, 'SELECT id, started, finished, status, added, updated, removed, sources, model, notes, commit_sha, received FROM ai_runs ORDER BY started DESC LIMIT 30')]);
  const checked = Date.parse(feedState.checkedAt);
  return json({
    feed: { checkedAt: feedState.checkedAt, live: feedState.live, source: feedState.source, ageMinutes: Math.round((Date.now() - checked) / 60000), notices: feedState.notice.length, study: feedState.study.length, digest: feedState.digest, aiItems: feedState.notice.filter(item => item.ai).length },
    runs, webhookConfigured: Boolean(c.env.AI_WEBHOOK_SECRET),
    editorialUrl: c.env.EDITORIAL_URL || DEFAULT_EDITORIAL_URL,
  });
});

route('POST', '/api/admin/ai/refresh', async c => {
  need(c.user, 2);
  const feedState = await editorial(c.env, { force: true });
  await audit(c.env, c.user, 'feed.refresh', 'feed', '', feedState.live ? 'live' : 'snapshot');
  return json({ ok: true, live: feedState.live, checkedAt: feedState.checkedAt });
});

route('POST', '/api/hooks/editorial-run', async c => {
  required(c.env.AI_WEBHOOK_SECRET, 404, 'Not found.');
  const raw = new TextDecoder().decode(await readBytes(c.request, 8000));
  const timestamp = c.request.headers.get('x-timestamp') || '';
  const signature = (c.request.headers.get('x-signature') || '').replace(/^sha256=/, '');
  required(/^\d{10,13}$/.test(timestamp) && Math.abs(c.now - Number(timestamp.length === 10 ? timestamp + '000' : timestamp)) < 300000, 401, 'Stale request.');
  required(safeEqual(signature, await hmacHex(c.env.AI_WEBHOOK_SECRET, `${timestamp}.${raw}`)), 401, 'Invalid signature.');
  let body;
  try { body = JSON.parse(raw); } catch { throw new RequestError(400, 'Invalid JSON.'); }
  required(body && typeof body === 'object' && ['success', 'partial', 'failed', 'noop'].includes(body.status), 400, 'Invalid status.');
  const num = value => Math.min(9999, Math.max(0, Math.trunc(Number(value) || 0)));
  const started = Number(body.started) > 0 ? Number(body.started) : c.now;
  await db(c.env, 'INSERT INTO ai_runs(id, started, finished, status, added, updated, removed, sources, model, notes, commit_sha, received) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    c.id, started, Number(body.finished) > 0 ? Number(body.finished) : c.now, body.status, num(body.added), num(body.updated), num(body.removed), num(body.sources),
    String(body.model || '').slice(0, 60), String(body.notes || '').slice(0, 400), String(body.commit || '').replace(/[^a-f0-9]/gi, '').slice(0, 40), c.now).run();
  await db(c.env, 'DELETE FROM ai_runs WHERE id NOT IN (SELECT id FROM ai_runs ORDER BY started DESC LIMIT 200)').run();
  await editorial(c.env, { force: true });
  return json({ ok: true }, 201);
}, { signed: true });
