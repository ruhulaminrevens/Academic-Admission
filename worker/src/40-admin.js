// ---- Admin console API: overview, members, moderation, content, tickets, settings, audit, export ----

const lastDays = count => {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(dhakaDay(Date.now() - i * 86400000));
  return out;
};
const dayBucket = column => `strftime('%Y-%m-%d', (${column} + 21600000) / 1000, 'unixepoch')`;

route('GET', '/api/admin/overview', async c => {
  need(c.user, 2);
  const week = c.now - 7 * 86400000;
  const days = lastDays(14);
  const since = c.now - 15 * 86400000;
  const [counts, signups, posts, comments, views, visitors] = await Promise.all([
    one(c.env, `SELECT
      (SELECT COUNT(*) FROM profiles) AS members, (SELECT COUNT(*) FROM profiles WHERE created > ?) AS newMembers,
      (SELECT COUNT(*) FROM profiles WHERE status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM posts WHERE created > ?) AS newPosts,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM tickets WHERE status = 'open') AS openTickets,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS openReports,
      (SELECT COUNT(*) FROM resources) AS resources`, week, week),
    rows(c.env, `SELECT ${dayBucket('created')} AS day, COUNT(*) AS n FROM profiles WHERE created > ? GROUP BY day`, since),
    rows(c.env, `SELECT ${dayBucket('created')} AS day, COUNT(*) AS n FROM posts WHERE created > ? GROUP BY day`, since),
    rows(c.env, `SELECT ${dayBucket('created')} AS day, COUNT(*) AS n FROM comments WHERE created > ? GROUP BY day`, since),
    rows(c.env, 'SELECT day, SUM(views) AS n FROM analytics_daily WHERE day >= ? GROUP BY day', days[0]),
    rows(c.env, 'SELECT day, COUNT(*) AS n FROM analytics_seen WHERE day >= ? GROUP BY day', days[0]),
  ]);
  const map = list => Object.fromEntries(list.map(row => [row.day, row.n]));
  const [s, p, m, v, u] = [signups, posts, comments, views, visitors].map(map);
  const feedState = await editorial(c.env);
  return json({
    counts, role: c.user.role,
    series: days.map(day => ({ day, signups: s[day] || 0, posts: p[day] || 0, comments: m[day] || 0, views: v[day] || 0, visitors: u[day] || 0 })),
    feed: { checkedAt: feedState.checkedAt, live: feedState.live },
  });
});

// ---------- members ----------

route('GET', '/api/admin/users', async c => {
  need(c.user, 2);
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const role = c.url.searchParams.get('role');
  const status = c.url.searchParams.get('status');
  const before = Number(c.url.searchParams.get('before') || 0);
  const conditions = [];
  const values = [];
  if (q) { conditions.push("p.name LIKE ? ESCAPE '\\'"); values.push('%' + q.replace(/[\\%_]/g, char => '\\' + char) + '%'); }
  if (roles.includes(role)) { conditions.push('p.role = ?'); values.push(role); }
  if (['active', 'suspended'].includes(status)) { conditions.push('p.status = ?'); values.push(status); }
  if (before > 0) { conditions.push('p.created < ?'); values.push(before); }
  const list = await rows(c.env, `SELECT p.id, p.name, p.focus, p.role, p.status, p.created, p.last_seen,
    (SELECT COUNT(*) FROM posts x WHERE x.author = p.id) AS posts,
    (SELECT COUNT(*) FROM comments x WHERE x.author = p.id) AS comments
    FROM profiles p ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY p.created DESC LIMIT 31`, ...values);
  return json({ users: list.slice(0, 30), more: list.length > 30 });
});

route('PUT', '/api/admin/users/:id', async c => {
  need(c.user, 2);
  const id = c.params.id;
  required(id !== c.user.id, 400, 'You cannot change your own role or status.');
  const target = await one(c.env, 'SELECT id, name, role, status FROM profiles WHERE id = ?', id);
  required(target, 404, 'Member not found.');
  const data = await input(c.request);
  const targetRank = roleRank[target.role] ?? 0;
  if (data.role !== undefined) {
    need(c.user, 3, 'Only the Super Admin can change roles.');
    required(['member', 'moderator', 'admin'].includes(data.role), 400, 'Role must be member, moderator or admin.');
    required(target.role !== 'superadmin', 400, 'The Super Admin role is controlled by the ADMIN_EMAIL setting.');
    await db(c.env, 'UPDATE profiles SET role = ? WHERE id = ?', data.role, id).run();
    await audit(c.env, c.user, 'member.role', 'member', id, `${target.name}: ${target.role} → ${data.role}`);
  }
  if (data.status !== undefined) {
    required(['active', 'suspended'].includes(data.status), 400, 'Status must be active or suspended.');
    required(c.user.rank > targetRank, 403, 'You can only manage members ranked below you.');
    const reason = clean(data.reason ?? '', 200);
    required(data.status === 'active' || reason.length >= 3, 400, 'Give a short reason for the suspension.');
    await db(c.env, 'UPDATE profiles SET status = ? WHERE id = ?', data.status, id).run();
    await audit(c.env, c.user, data.status === 'suspended' ? 'member.suspend' : 'member.restore', 'member', id, `${target.name}${reason ? ': ' + reason : ''}`);
  }
  return json({ ok: true });
});

// ---------- moderation ----------

route('GET', '/api/admin/reports', async c => {
  need(c.user, 1);
  const status = ['open', 'resolved', 'dismissed'].includes(c.url.searchParams.get('status')) ? c.url.searchParams.get('status') : 'open';
  return json(await rows(c.env, `SELECT r.id, r.kind, r.target, r.post, r.reason, r.detail, r.status, r.created, r.handled, rp.name AS reporter,
    CASE r.kind WHEN 'post' THEN p.title ELSE substr(cm.body, 1, 200) END AS excerpt,
    CASE r.kind WHEN 'post' THEN substr(p.body, 1, 300) ELSE NULL END AS preview,
    CASE r.kind WHEN 'post' THEN pu.name ELSE cu.name END AS author
    FROM reports r JOIN profiles rp ON rp.id = r.reporter
    LEFT JOIN posts p ON p.id = r.post LEFT JOIN profiles pu ON pu.id = p.author
    LEFT JOIN comments cm ON cm.id = r.target AND r.kind = 'comment' LEFT JOIN profiles cu ON cu.id = cm.author
    WHERE r.status = ? ORDER BY r.created DESC LIMIT 100`, status));
});

route('PUT', '/api/admin/reports/:id', async c => {
  need(c.user, 1);
  const id = pathId(c.params);
  const report = await one(c.env, 'SELECT id, kind, target, post FROM reports WHERE id = ?', id);
  required(report, 404, 'Report not found.');
  const data = await input(c.request);
  required(['resolved', 'dismissed'].includes(data.status), 400, 'Status must be resolved or dismissed.');
  if (data.action === 'delete') {
    if (report.kind === 'post') await db(c.env, 'DELETE FROM posts WHERE id = ?', report.target).run();
    else await db(c.env, 'DELETE FROM comments WHERE id = ?', report.target).run();
    await audit(c.env, c.user, report.kind + '.delete', report.kind, report.target, 'via report');
    statsCache.at = 0;
    await db(c.env, "UPDATE reports SET status = 'resolved', handled_by = ?, handled = ? WHERE kind = ? AND target = ? AND status = 'open'", c.user.id, c.now, report.kind, report.target).run();
  } else {
    await db(c.env, 'UPDATE reports SET status = ?, handled_by = ?, handled = ? WHERE id = ?', data.status, c.user.id, c.now, id).run();
    await audit(c.env, c.user, 'report.' + data.status, report.kind, report.target);
  }
  return json({ ok: true });
});

// ---------- published resources (notices / study) ----------

function resourceInput(data) {
  const types = data.section === 'notice' ? noticeTypes : data.section === 'study' ? studyTypes : [];
  required(types.includes(data.category), 400, 'Choose a valid category.');
  const url = safeLink(data.url ?? '');
  required(data.section !== 'notice' || url, 400, 'Notices require an HTTPS source.');
  const deadline = typeof data.deadline === 'string' ? data.deadline.trim() : '';
  required(!deadline || (data.section === 'notice' && isRealDate(deadline)), 400, 'Deadline must be a real YYYY-MM-DD date on a notice.');
  return { section: data.section, category: data.category, title: clean(data.title, 160, 3), summary: clean(data.summary, 800, 3), url, deadline: deadline || null, pinned: data.pinned === true ? 1 : 0 };
}

route('GET', '/api/admin/resources', async c => {
  need(c.user, 2);
  return json(await rows(c.env, 'SELECT id, section, category, title, summary, url, deadline, pinned, created, updated FROM resources ORDER BY created DESC LIMIT 200'));
});

route('POST', '/api/admin/resources', async c => {
  need(c.user, 2);
  const item = resourceInput(await input(c.request));
  await db(c.env, 'INSERT INTO resources(id, section, category, title, summary, url, created, deadline, pinned) VALUES(?,?,?,?,?,?,?,?,?)',
    c.id, item.section, item.category, item.title, item.summary, item.url, c.now, item.deadline, item.pinned).run();
  await audit(c.env, c.user, 'resource.create', item.section, c.id, item.title);
  statsCache.at = 0;
  return json({ id: c.id }, 201);
});

route('PUT', '/api/admin/resources/:id', async c => {
  need(c.user, 2);
  const id = pathId(c.params);
  required(await one(c.env, 'SELECT 1 AS ok FROM resources WHERE id = ?', id), 404, 'Item not found.');
  const item = resourceInput(await input(c.request));
  await db(c.env, 'UPDATE resources SET section = ?, category = ?, title = ?, summary = ?, url = ?, deadline = ?, pinned = ?, updated = ? WHERE id = ?',
    item.section, item.category, item.title, item.summary, item.url, item.deadline, item.pinned, c.now, id).run();
  await audit(c.env, c.user, 'resource.update', item.section, id, item.title);
  return json({ ok: true });
});

route('DELETE', '/api/admin/resources/:id', async c => {
  need(c.user, 2);
  const id = pathId(c.params);
  const row = await one(c.env, 'SELECT title, section FROM resources WHERE id = ?', id);
  required(row, 404, 'Item not found.');
  await db(c.env, 'DELETE FROM resources WHERE id = ?', id).run();
  await audit(c.env, c.user, 'resource.delete', row.section, id, row.title);
  statsCache.at = 0;
  return json({ ok: true });
});

// ---------- Information Desk ----------

route('GET', '/api/admin/tickets', async c => {
  need(c.user, 2);
  const status = c.url.searchParams.get('status');
  const filter = ['open', 'answered', 'closed'].includes(status) ? 'WHERE t.status = ?' : '';
  return json(await rows(c.env, `SELECT t.id, t.subject, t.body, t.answer, t.status, t.created, t.answered, p.name FROM tickets t
    JOIN profiles p ON p.id = t.owner ${filter} ORDER BY (t.status = 'open') DESC, t.created DESC LIMIT 100`, ...(filter ? [status] : [])));
});

route('PUT', '/api/admin/tickets/:id', async c => {
  need(c.user, 2);
  const id = pathId(c.params);
  const ticket = await one(c.env, 'SELECT id, subject FROM tickets WHERE id = ?', id);
  required(ticket, 404, 'Request not found.');
  const data = await input(c.request);
  if (data.answer !== undefined) {
    await db(c.env, "UPDATE tickets SET answer = ?, status = 'answered', answered = ? WHERE id = ?", clean(data.answer, 1800, 3), c.now, id).run();
    await audit(c.env, c.user, 'ticket.answer', 'ticket', id, ticket.subject);
  } else {
    required(['open', 'closed'].includes(data.status), 400, 'Status must be open or closed.');
    await db(c.env, 'UPDATE tickets SET status = ? WHERE id = ?', data.status, id).run();
    await audit(c.env, c.user, 'ticket.' + data.status, 'ticket', id, ticket.subject);
  }
  return json({ ok: true });
});

// ---------- Super Admin: settings, audit log, export ----------

route('GET', '/api/admin/settings', async c => {
  need(c.user, 3);
  return json(await getSettings(c.env, true));
});

route('PUT', '/api/admin/settings', async c => {
  need(c.user, 3);
  const data = await input(c.request, 8000);
  const keys = Object.keys(data);
  required(keys.length > 0 && keys.length <= 20, 400, 'Nothing to update.');
  const clean_ = Object.fromEntries(keys.map(key => [key, normalizeSetting(key, data[key])]));
  await c.env.DB.batch(Object.entries(clean_).map(([key, value]) =>
    db(c.env, 'INSERT INTO settings(key, value, updated, updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated, updated_by = excluded.updated_by', key, value, c.now, c.user.id)));
  settingsCache.at = 0;
  await audit(c.env, c.user, 'settings.update', 'settings', '', keys.join(', '));
  return json({ ok: true, settings: await getSettings(c.env, true) });
});

route('GET', '/api/admin/audit', async c => {
  need(c.user, 3);
  const before = Number(c.url.searchParams.get('before') || 0);
  const list = await rows(c.env, `SELECT id, actor_name, action, target_type, target, detail, created FROM audit_log
    ${before > 0 ? 'WHERE created < ?' : ''} ORDER BY created DESC LIMIT 51`, ...(before > 0 ? [before] : []));
  return json({ entries: list.slice(0, 50), more: list.length > 50 });
});

route('GET', '/api/admin/export', async c => {
  need(c.user, 3);
  const cap = 'LIMIT 50000';
  const [profiles, posts, comments, resources, tickets, reports, settings] = await Promise.all([
    rows(c.env, `SELECT id, name, focus, goal, role, status, created, last_seen FROM profiles ${cap}`),
    rows(c.env, `SELECT id, author, title, body, topic, pinned, views, created FROM posts ${cap}`),
    rows(c.env, `SELECT id, post, author, body, created FROM comments ${cap}`),
    rows(c.env, `SELECT * FROM resources ${cap}`),
    rows(c.env, `SELECT id, owner, subject, body, answer, status, created FROM tickets ${cap}`),
    rows(c.env, `SELECT * FROM reports ${cap}`),
    rows(c.env, 'SELECT key, value FROM settings'),
  ]);
  await audit(c.env, c.user, 'data.export', 'site', '', 'full JSON export');
  return response(JSON.stringify({ exportedAt: new Date().toISOString(), profiles, posts, comments, resources, tickets, reports, settings }, null, 2),
    'application/json; charset=utf-8', { headers: { 'Content-Disposition': 'attachment; filename="academic-admission-export.json"' } });
});
