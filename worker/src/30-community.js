// ---- Session, profile, community feed, comments, reactions, reports, search, account ----

const postFields = `p.id, p.title, p.body, p.topic, p.created, p.pinned, p.views, u.name, u.role AS authorRole,
  (p.author = ?) AS mine,
  (SELECT COUNT(*) FROM comments c WHERE c.post = p.id) AS comments,
  (SELECT COUNT(*) FROM reactions r WHERE r.post = p.id AND r.kind = 'like') AS likes,
  (SELECT COUNT(*) FROM reactions r WHERE r.post = p.id AND r.kind = 'helpful') AS helpful,
  (SELECT kind FROM reactions r WHERE r.post = p.id AND r.author = ?) AS myReaction,
  EXISTS(SELECT 1 FROM bookmarks b WHERE b.post = p.id AND b.author = ?) AS saved`;
const postFrom = 'FROM posts p JOIN profiles u ON u.id = p.author';

function feed(env, user, where, values, order, max) {
  return rows(env, `SELECT ${postFields} ${postFrom} ${where} ORDER BY ${order} LIMIT ?`, user.id, user.id, user.id, ...values, max);
}

async function communityFeed(env, user, topic, before) {
  const hasTopic = topics.includes(topic);
  const conditions = ['p.pinned = 0'];
  const values = [];
  if (before) { conditions.push('p.created < ?'); values.push(before); }
  if (hasTopic) { conditions.push('p.topic = ?'); values.push(topic); }
  const list = await feed(env, user, 'WHERE ' + conditions.join(' AND '), values, 'p.created DESC, p.id', 25);
  const pinned = before ? [] : await feed(env, user, 'WHERE p.pinned = 1' + (hasTopic ? ' AND p.topic = ?' : ''), hasTopic ? [topic] : [], 'p.created DESC', 3);
  return { posts: [...pinned, ...list], more: list.length === 25 };
}

const topPosts = (env, user) => feed(env, user, 'WHERE p.created >= ?', [Date.now() - 7 * 86400000], '(likes+helpful+comments) DESC, p.created DESC', 8);

let statsCache = { at: 0, data: null };
async function siteStats(env) {
  if (statsCache.data && Date.now() - statsCache.at < 30000) return statsCache.data;
  const [counts, notice, study] = await Promise.all([
    one(env, 'SELECT (SELECT COUNT(*) FROM profiles) AS members, (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM comments) AS comments'),
    loadSection(env, 'notice'), loadSection(env, 'study'),
  ]);
  statsCache = { at: Date.now(), data: { ...counts, notices: notice.items.length, study: study.items.length } };
  return statsCache.data;
}

route('GET', '/api/session', async c => {
  const settings = await getSettings(c.env);
  return json({ ...sessionUser(c.user), googleEnabled: googleEnabled(c.env), googleLinked: googleEnabled(c.env) && !!c.user.id && Boolean(await one(c.env, 'SELECT subject FROM google_identities WHERE owner=?', c.user.id)), provider: c.user.provider, admin: c.user.rank >= 2, can: { moderate: c.user.rank >= 1, admin: c.user.rank >= 2, owner: c.user.rank >= 3 }, site: publicSettings(settings), version: assets.version });
});

route('GET', '/api/health', async c => {
  const result = { ok: true, version: assets.version, time: new Date().toISOString(), db: false, bucket: Boolean(c.env.BUCKET), schema: false };
  try { await one(c.env, 'SELECT 1 AS ok'); result.db = true; await one(c.env, 'SELECT id FROM admission_revisions LIMIT 1'); result.schema = true; } catch { result.ok = false; }
  const feedState = await editorial(c.env);
  result.editorial = { checkedAt: feedState.checkedAt, live: feedState.live, ageMinutes: Math.round((Date.now() - Date.parse(feedState.checkedAt)) / 60000) };
  return json(result, result.ok ? 200 : 503);
});

route('PUT', '/api/profile', async c => {
  member(c.user);
  const settings = await getSettings(c.env);
  if (!c.user.profile) required(settings.registration_open !== '0' || c.user.rank >= 2, 403, 'New registrations are paused right now.');
  else required(c.user.status === 'active', 403, 'Your account is suspended.');
  const data = await input(c.request);
  const name = clean(data.name, 55, 2);
  await db(c.env, `INSERT INTO profiles(id, name, focus, goal, created, role) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, focus = excluded.focus, goal = excluded.goal`,
    c.user.id, name, clean(data.focus ?? '', 80), clean(data.goal ?? '', 500), c.now, c.user.owner ? 'superadmin' : 'member').run();
  statsCache.at = 0;
  return json({ ok: true });
});

route('GET', '/api/feed', async c => {
  const topic = c.url.searchParams.get('topic');
  const before = Number(c.url.searchParams.get('before') || 0);
  required(Number.isSafeInteger(before) && before >= 0, 400, 'Invalid page cursor.');
  return json((await communityFeed(c.env, c.user, topic, before)).posts);
});

route('GET', '/api/top', async c => json(await topPosts(c.env, c.user)));

route('POST', '/api/feed', async c => {
  const settings = await getSettings(c.env);
  writer(c.user, settings);
  const data = await input(c.request);
  required(topics.includes(data.topic), 400, 'Choose a topic.');
  await limit(c.env, 'posts', 'author', c.user.id, 3600000, 12, 'Hourly post limit reached.');
  await db(c.env, 'INSERT INTO posts(id, author, title, body, topic, created) VALUES(?,?,?,?,?,?)',
    c.id, c.user.id, clean(data.title, 120, 3), clean(data.body, 4000, 3), data.topic, c.now).run();
  statsCache.at = 0;
  return json({ id: c.id }, 201);
});

route('GET', '/api/stats', async c => json(await siteStats(c.env)));

route('GET', '/api/search', async c => {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 80);
  required(q.length >= 2, 400, 'Type at least 2 characters.');
  const like = '%' + q.replace(/[\\%_]/g, char => '\\' + char) + '%';
  const [posts, notice, study] = await Promise.all([
    rows(c.env, `SELECT p.id, p.title, p.topic, p.created FROM posts p WHERE p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' ORDER BY p.created DESC LIMIT 6`, like, like),
    loadSection(c.env, 'notice'), loadSection(c.env, 'study'),
  ]);
  const needle = q.toLowerCase();
  const pick = list => list.items.filter(item => (item.title + ' ' + item.summary + ' ' + item.source).toLowerCase().includes(needle))
    .slice(0, 6).map(item => ({ id: item.id, title: item.title, category: item.category, created: item.created, url: item.url }));
  return json({ q, posts, notices: pick(notice), study: pick(study) });
});

// ---------- editorial lists ----------

route('GET', '/api/notice', async c => json(await loadSection(c.env, 'notice')));
route('GET', '/api/study', async c => json(await loadSection(c.env, 'study')));
route('GET', '/api/notice/:id', async c => {
  const item = await findNotice(c.env, c.params.id);
  required(item, 404, 'Notice not found.');
  const all = await loadSection(c.env, 'notice');
  return json({ item, related: all.items.filter(other => other.id !== item.id && other.category === item.category).slice(0, 3), checkedAt: all.checkedAt, live: all.live });
});

// ---------- posts ----------

route('GET', '/api/posts/:id', async c => {
  const id = pathId(c.params);
  const post = (await feed(c.env, c.user, 'WHERE p.id = ?', [id], 'p.created DESC', 1))[0];
  required(post, 404, 'Post not found.');
  return json(post);
});

route('DELETE', '/api/posts/:id', async c => {
  member(c.user);
  const id = pathId(c.params);
  const record = await one(c.env, 'SELECT author, title FROM posts WHERE id = ?', id);
  required(record, 404, 'Post not found.');
  required(c.user.rank >= 1 || record.author === c.user.id, 403, 'You cannot delete this post.');
  await db(c.env, 'DELETE FROM posts WHERE id = ?', id).run();
  await db(c.env, "UPDATE reports SET status = 'resolved', handled_by = ?, handled = ? WHERE post = ? AND status = 'open'", c.user.id, c.now, id).run();
  if (record.author !== c.user.id) await audit(c.env, c.user, 'post.delete', 'post', id, record.title);
  statsCache.at = 0;
  return json({ ok: true });
});

route('PUT', '/api/posts/:id/pin', async c => {
  need(c.user, 1);
  const id = pathId(c.params);
  const { pinned } = await input(c.request);
  required(typeof pinned === 'boolean', 400, 'Invalid value.');
  required(await one(c.env, 'SELECT 1 AS ok FROM posts WHERE id = ?', id), 404, 'Post not found.');
  if (pinned) required((await one(c.env, 'SELECT COUNT(*) AS n FROM posts WHERE pinned = 1')).n < 3, 409, 'Up to 3 posts can be pinned. Unpin one first.');
  await db(c.env, 'UPDATE posts SET pinned = ? WHERE id = ?', pinned ? 1 : 0, id).run();
  await audit(c.env, c.user, pinned ? 'post.pin' : 'post.unpin', 'post', id);
  return json({ ok: true });
});

route('GET', '/api/posts/:id/comments', async c => {
  const id = pathId(c.params);
  return json(await rows(c.env, `SELECT c.id, c.body, c.created, p.name, p.role AS authorRole, (c.author = ?) AS mine
    FROM comments c JOIN profiles p ON p.id = c.author WHERE c.post = ? ORDER BY c.created DESC LIMIT 100`, c.user.id, id));
});

route('POST', '/api/posts/:id/comments', async c => {
  const settings = await getSettings(c.env);
  writer(c.user, settings);
  const id = pathId(c.params);
  required(await one(c.env, 'SELECT 1 AS ok FROM posts WHERE id = ?', id), 404, 'Post not found.');
  const { body } = await input(c.request);
  await limit(c.env, 'comments', 'author', c.user.id, 3600000, 40, 'Hourly comment limit reached.');
  await db(c.env, 'INSERT INTO comments(id, post, author, body, created) VALUES(?,?,?,?,?)', c.id, id, c.user.id, clean(body, 1000, 1), c.now).run();
  return json({ id: c.id }, 201);
});

route('DELETE', '/api/posts/:id/comments/:commentId', async c => {
  member(c.user);
  const id = pathId(c.params);
  const commentId = pathId(c.params, 'commentId');
  const row = await one(c.env, 'SELECT author, body FROM comments WHERE id = ? AND post = ?', commentId, id);
  required(row && (c.user.rank >= 1 || row.author === c.user.id), 403, 'You cannot delete this comment.');
  await db(c.env, 'DELETE FROM comments WHERE id = ? AND post = ?', commentId, id).run();
  await db(c.env, "UPDATE reports SET status = 'resolved', handled_by = ?, handled = ? WHERE kind = 'comment' AND target = ? AND status = 'open'", c.user.id, c.now, commentId).run();
  if (row.author !== c.user.id) await audit(c.env, c.user, 'comment.delete', 'comment', commentId, truncate(row.body, 120));
  return json({ ok: true });
});

route('PUT', '/api/posts/:id/reaction', async c => {
  const settings = await getSettings(c.env);
  writer(c.user, settings);
  const id = pathId(c.params);
  required(await one(c.env, 'SELECT 1 AS ok FROM posts WHERE id = ?', id), 404, 'Post not found.');
  const { kind } = await input(c.request);
  required(['like', 'helpful', null].includes(kind), 400, 'Invalid reaction.');
  if (kind === null) await db(c.env, 'DELETE FROM reactions WHERE post = ? AND author = ?', id, c.user.id).run();
  else await db(c.env, 'INSERT INTO reactions(post, author, kind) VALUES(?,?,?) ON CONFLICT(post, author) DO UPDATE SET kind = excluded.kind', id, c.user.id, kind).run();
  return json({ ok: true });
});

route('PUT', '/api/posts/:id/bookmark', async c => {
  const settings = await getSettings(c.env);
  writer(c.user, settings);
  const id = pathId(c.params);
  required(await one(c.env, 'SELECT 1 AS ok FROM posts WHERE id = ?', id), 404, 'Post not found.');
  const { saved } = await input(c.request);
  required(typeof saved === 'boolean', 400, 'Invalid bookmark.');
  if (saved) await db(c.env, 'INSERT OR IGNORE INTO bookmarks(post, author) VALUES(?,?)', id, c.user.id).run();
  else await db(c.env, 'DELETE FROM bookmarks WHERE post = ? AND author = ?', id, c.user.id).run();
  return json({ ok: true });
});

route('POST', '/api/posts/:id/report', async c => {
  hasProfile(c.user);
  const id = pathId(c.params);
  const data = await input(c.request);
  required(reportReasons.includes(data.reason), 400, 'Choose a reason.');
  const detail = clean(data.detail ?? '', 300);
  const post = await one(c.env, 'SELECT author FROM posts WHERE id = ?', id);
  required(post, 404, 'Post not found.');
  let kind = 'post', target = id, author = post.author;
  if (data.commentId) {
    required(isUuid(data.commentId), 400, 'Invalid comment.');
    const comment = await one(c.env, 'SELECT author FROM comments WHERE id = ? AND post = ?', data.commentId, id);
    required(comment, 404, 'Comment not found.');
    kind = 'comment'; target = data.commentId; author = comment.author;
  }
  required(author !== c.user.id, 400, 'You cannot report your own content.');
  await limit(c.env, 'reports', 'reporter', c.user.id, 3600000, 10, 'Hourly report limit reached.');
  const result = await db(c.env, 'INSERT OR IGNORE INTO reports(id, kind, target, post, reporter, reason, detail, created) VALUES(?,?,?,?,?,?,?,?)',
    c.id, kind, target, id, c.user.id, data.reason, detail, c.now).run();
  return json({ ok: true, duplicate: !result.meta?.changes }, 201);
});

// ---------- account ----------

route('GET', '/api/account', async c => {
  hasProfile(c.user);
  const [saved, posts, tickets] = await Promise.all([
    feed(c.env, c.user, 'WHERE EXISTS(SELECT 1 FROM bookmarks b WHERE b.post = p.id AND b.author = ?)', [c.user.id], 'p.created DESC', 50),
    feed(c.env, c.user, 'WHERE p.author = ?', [c.user.id], 'p.created DESC', 50),
    rows(c.env, 'SELECT id, subject, body, answer, status, created, answered FROM tickets WHERE owner = ? ORDER BY created DESC LIMIT 50', c.user.id),
  ]);
  return json({ saved, posts, tickets });
});

route('GET', '/api/account/export', async c => {
  hasProfile(c.user);
  const [posts, comments, bookmarks, reactions, tickets] = await Promise.all([
    rows(c.env, 'SELECT id, title, body, topic, created FROM posts WHERE author = ?', c.user.id),
    rows(c.env, 'SELECT id, post, body, created FROM comments WHERE author = ?', c.user.id),
    rows(c.env, 'SELECT post FROM bookmarks WHERE author = ?', c.user.id),
    rows(c.env, 'SELECT post, kind FROM reactions WHERE author = ?', c.user.id),
    rows(c.env, 'SELECT id, subject, body, answer, status, created FROM tickets WHERE owner = ?', c.user.id),
  ]);
  const files = (await c.env.BUCKET.list({ prefix: `users/${c.user.id}/`, limit: 12, include: ['customMetadata'] })).objects
    .map(file => ({ slot: file.key.split('/').pop(), name: file.customMetadata?.name || 'Document', size: file.size, uploaded: file.uploaded }));
  const profile = { name: c.user.profile.name, focus: c.user.profile.focus, goal: c.user.profile.goal, created: c.user.profile.created, role: c.user.role, status: c.user.status };
  const applications = await rows(c.env, 'SELECT circular,stage,updated FROM admission_plans WHERE owner=?', c.user.id);
  const reminders = await one(c.env, 'SELECT email,enabled,opted_in FROM admission_reminders WHERE owner=?', c.user.id);
  return response(JSON.stringify({ applications, reminders, exportedAt: new Date().toISOString(), profile, posts, comments, bookmarks, reactions, tickets, files }, null, 2),
    'application/json; charset=utf-8', { headers: { 'Content-Disposition': 'attachment; filename="academic-admission-my-data.json"' } });
});

route('DELETE', '/api/account', async c => {
  hasProfile(c.user);
  const { confirm } = await input(c.request);
  required(confirm === 'DELETE', 400, 'Type DELETE to confirm.');
  const id = c.user.id;
  const prefix = `users/${id}/`;
  const listed = await c.env.BUCKET.list({ prefix, limit: 100 });
  if (listed.objects.length) await c.env.BUCKET.delete(listed.objects.map(file => file.key));
  await c.env.DB.batch([
    db(c.env, 'DELETE FROM google_sessions WHERE owner=?', id),
    db(c.env, 'DELETE FROM google_identities WHERE owner=?', id),
    db(c.env, "DELETE FROM reports WHERE reporter = ? OR post IN (SELECT id FROM posts WHERE author = ?) OR (kind = 'comment' AND target IN (SELECT id FROM comments WHERE author = ?))", id, id, id),
    db(c.env, 'DELETE FROM reactions WHERE author = ?', id),
    db(c.env, 'DELETE FROM bookmarks WHERE author = ?', id),
    db(c.env, 'DELETE FROM comments WHERE author = ?', id),
    db(c.env, 'DELETE FROM posts WHERE author = ?', id),
    db(c.env, 'DELETE FROM tickets WHERE owner = ?', id),
    db(c.env, 'DELETE FROM profiles WHERE id = ?', id),
  ]);
  statsCache.at = 0;
  return json({ ok: true });
});

route('POST', '/api/tickets', async c => {
  hasProfile(c.user);
  const data = await input(c.request);
  await limit(c.env, 'tickets', 'owner', c.user.id, 86400000, 6, 'Daily request limit reached.');
  await db(c.env, 'INSERT INTO tickets(id, owner, subject, body, created) VALUES(?,?,?,?,?)', c.id, c.user.id, clean(data.subject, 120, 3), clean(data.body, 1800, 3), c.now).run();
  return json({ id: c.id }, 201);
});
