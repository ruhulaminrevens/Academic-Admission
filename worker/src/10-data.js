// ---- Data layer: D1 helpers, settings, identity, permissions, audit, rate limits ----

function db(env, statement, ...values) {
  return env.DB.prepare(statement).bind(...values);
}
async function rows(env, statement, ...values) {
  return (await db(env, statement, ...values).all()).results;
}
function one(env, statement, ...values) {
  return db(env, statement, ...values).first();
}

// ---------- site settings (Super Admin) ----------

const settingDefaults = {
  announcement_active: '0', announcement_text: '', announcement_level: 'info', announcement_link: '',
  readonly: '0', registration_open: '1', site_tagline: '', contact_email: '',
  social_facebook: '', social_telegram: '', social_whatsapp: '', social_youtube: '',
};
const settingSpecs = {
  announcement_active: { type: 'bool' },
  announcement_text: { type: 'text', max: 240 },
  announcement_level: { type: 'enum', values: ['info', 'success', 'warning'] },
  announcement_link: { type: 'url' },
  readonly: { type: 'bool' },
  registration_open: { type: 'bool' },
  site_tagline: { type: 'text', max: 140 },
  contact_email: { type: 'email' },
  social_facebook: { type: 'url' },
  social_telegram: { type: 'url' },
  social_whatsapp: { type: 'url' },
  social_youtube: { type: 'url' },
};

function normalizeSetting(key, value) {
  const spec = settingSpecs[key];
  required(spec, 400, `Unknown setting: ${key}`);
  if (spec.type === 'bool') {
    required(value === true || value === false || value === '1' || value === '0', 400, `${key} must be on or off.`);
    return value === true || value === '1' ? '1' : '0';
  }
  if (spec.type === 'enum') {
    required(spec.values.includes(value), 400, `${key} must be one of ${spec.values.join(', ')}.`);
    return value;
  }
  if (spec.type === 'url') return safeLink(value ?? '');
  if (spec.type === 'email') {
    const text = clean(value ?? '', 120);
    required(!text || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text), 400, 'Enter a valid email address.');
    return text;
  }
  return clean(value ?? '', spec.max);
}

let settingsCache = { at: 0, data: null };
async function getSettings(env, fresh = false) {
  if (!fresh && settingsCache.data && Date.now() - settingsCache.at < 10000) return settingsCache.data;
  const data = { ...settingDefaults };
  try {
    for (const row of await rows(env, 'SELECT key, value FROM settings')) if (row.key in settingDefaults) data[row.key] = row.value;
  } catch { /* migration pending: fall back to defaults */ }
  settingsCache = { at: Date.now(), data };
  return data;
}

function publicSettings(settings) {
  const social = {};
  for (const name of ['facebook', 'telegram', 'whatsapp', 'youtube']) if (settings['social_' + name]) social[name] = settings['social_' + name];
  return {
    announcement: settings.announcement_active === '1' && settings.announcement_text ?
      { text: settings.announcement_text, level: settings.announcement_level, link: settings.announcement_link } : null,
    readonly: settings.readonly === '1',
    registrationOpen: settings.registration_open !== '0',
    tagline: settings.site_tagline,
    contactEmail: settings.contact_email,
    social,
  };
}

// ---------- identity and permissions ----------

async function identify(env, request) {
  const id = request.headers.get('oai-authenticated-user-id') || '';
  const email = request.headers.get('oai-authenticated-user-email') || '';
  const owner = Boolean(id && email && env.ADMIN_EMAIL && email.toLowerCase() === String(env.ADMIN_EMAIL).toLowerCase());
  const user = { id, signedIn: Boolean(id), owner, profile: null, rank: 0, role: 'member', status: 'active' };
  if (!id) return user;
  const profile = await one(env, 'SELECT id, name, focus, goal, created, role, status, last_seen FROM profiles WHERE id = ?', id);
  if (profile) {
    user.profile = profile;
    user.status = profile.status;
    if (owner && profile.role !== 'superadmin') {
      await db(env, "UPDATE profiles SET role = 'superadmin' WHERE id = ?", id).run();
      profile.role = 'superadmin';
    }
    if (Date.now() - (profile.last_seen || 0) > 3600000) await db(env, 'UPDATE profiles SET last_seen = ? WHERE id = ?', Date.now(), id).run();
  }
  if (owner) { user.rank = 3; user.role = 'superadmin'; }
  else if (profile && profile.status === 'active') {
    user.rank = Math.min(roleRank[profile.role] ?? 0, 2);
    user.role = roles[user.rank];
  }
  return user;
}

function sessionUser(user) {
  return { signedIn: user.signedIn, profile: user.profile ? { name: user.profile.name, focus: user.profile.focus, goal: user.profile.goal, created: user.profile.created, role: user.role, status: user.status } : null, rank: user.rank };
}

function member(user) {
  required(user.id, 401, 'Sign in with ChatGPT to continue.');
}
function hasProfile(user) {
  member(user);
  required(user.profile, 409, 'Create your profile from Account first.');
}
function writer(user, settings) {
  hasProfile(user);
  required(user.status === 'active', 403, 'Your account is suspended. Use the Information Desk to contact the team.');
  required(settings.readonly !== '1' || user.rank >= 1, 503, 'The site is in read-only mode right now. Please try again later.');
}
function need(user, rank, message) {
  required(user.rank >= rank, user.id ? 403 : 401, message || (rank >= 3 ? 'Super Admin access required.' : rank >= 2 ? 'Admin access required.' : 'Moderator access required.'));
}

async function audit(env, user, action, targetType = '', target = '', detail = '') {
  await db(env, 'INSERT INTO audit_log(id, actor, actor_name, action, target_type, target, detail, created) VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(), user.id, user.profile?.name || (user.owner ? 'Owner' : ''), action, targetType, String(target), String(detail).slice(0, 400), Date.now()).run();
}

async function limit(env, table, column, who, windowMs, max, message) {
  const row = await one(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ? AND created > ?`, who, Date.now() - windowMs);
  required(row.n < max, 429, message);
}

// ---------- editorial feed ----------

const editorialState = { data: null, expires: 0, request: null };

async function editorial(env, { force = false } = {}) {
  if (!force && editorialState.data && editorialState.expires > Date.now()) return editorialState.data;
  if (editorialState.request) return editorialState.request;
  editorialState.request = (async () => {
    const target = env.EDITORIAL_URL || DEFAULT_EDITORIAL_URL;
    try {
      if (target.startsWith('bundled:')) {
        editorialState.data = { ...parseEditorial(assets.editorial, inferDeadline), live: true, source: 'bundled' };
        editorialState.expires = Date.now() + 60000;
        return editorialState.data;
      }
      const href = httpsHref(target);
      if (!href) throw new Error('Invalid EDITORIAL_URL.');
      const result = await fetch(href, { signal: AbortSignal.timeout(4500), headers: { Accept: 'application/json' } });
      if (!result.ok) throw new Error('Editorial feed unavailable.');
      const text = await result.text();
      if (text.length > 260000) throw new Error('Editorial feed exceeds size limit.');
      editorialState.data = { ...parseEditorial(JSON.parse(text), inferDeadline), live: true, source: 'remote' };
      editorialState.expires = Date.now() + 60000;
    } catch {
      const previous = editorialState.data ?? { ...parseEditorial(assets.editorial, inferDeadline), source: 'bundled' };
      editorialState.data = { ...previous, live: false };
      editorialState.expires = Date.now() + 20000;
    } finally {
      editorialState.request = null;
    }
    return editorialState.data;
  })();
  return editorialState.request;
}

async function loadSection(env, section) {
  const [feed, adminRows] = await Promise.all([
    editorial(env),
    rows(env, `SELECT id, category, title, summary, url, created, deadline, pinned, 'Admin' AS origin, 'Site admin' AS source
      FROM resources WHERE section = ? ORDER BY created DESC LIMIT 80`, section),
  ]);
  const adminItems = adminRows.map(row => {
    const item = { ...row, deadline: row.deadline || '', deadlineInferred: false, ai: false };
    if (section === 'notice' && !item.deadline) {
      const guess = inferDeadline(item.title + ' ' + item.summary);
      if (guess) { item.deadline = guess; item.deadlineInferred = true; }
    }
    return item;
  });
  const items = [...adminItems, ...feed[section].map(item => ({ ...item, pinned: 0 }))]
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created - a.created);
  return { items, checkedAt: feed.checkedAt, live: feed.live, digest: feed.digest };
}

async function findNotice(env, id) {
  if (isUuid(id)) {
    const row = await one(env, `SELECT id, category, title, summary, url, created, deadline, pinned, 'Admin' AS origin, 'Site admin' AS source FROM resources WHERE id = ? AND section = 'notice'`, id);
    if (!row) return null;
    const item = { ...row, deadline: row.deadline || '', deadlineInferred: false, ai: false };
    if (!item.deadline) { const guess = inferDeadline(item.title + ' ' + item.summary); if (guess) { item.deadline = guess; item.deadlineInferred = true; } }
    return item;
  }
  const feed = await editorial(env);
  return feed.notice.find(item => item.id === id) || null;
}
