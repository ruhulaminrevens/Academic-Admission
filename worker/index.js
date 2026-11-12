const noticeTypes = ['Admission', 'Exam', 'Holiday', 'Official', 'Breaking'];
const studyTypes = ['Trend', 'Tip', 'Video', 'Website'];
const topics = ['Admission', 'Study', 'Question', 'General'];
const editorialUrl = 'https://raw.githubusercontent.com/ruhulaminrevens/Academic-Admission/main/data/editorial.json';
const sizeLimit = 5 * 1024 * 1024;
const fileTypes = {'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg'};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function response(body, type, options = {}) {
  const headers = {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...options.headers,
  };
  return new Response(body, { ...options, headers });
}

function json(data, status = 200) {
  return response(JSON.stringify(data), 'application/json; charset=utf-8', { status });
}

function required(condition, status, message) {
  if (!condition) throw new RequestError(status, message);
}

function clean(value, max, min = 0) {
  const text = typeof value === 'string' ? value.trim() : '';
  required(text.length >= min && text.length <= max, 400, `Use ${min}–${max} characters.`);
  return text;
}

function safeLink(value) {
  const link = clean(value, 600);
  if (!link) return '';
  let parsed;
  try { parsed = new URL(link); } catch { throw new RequestError(400, 'Enter a valid HTTPS link.'); }
  required(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 400, 'Enter a valid HTTPS link.');
  return parsed.href;
}

async function input(request) {
  required(request.headers.get('content-type')?.startsWith('application/json'), 415, 'Expected JSON.');
  let value;
  try { value = JSON.parse(new TextDecoder().decode(await readBytes(request, 20000))); }
  catch (error) { if (error instanceof RequestError) throw error; }
  required(value && typeof value === 'object' && !Array.isArray(value), 400, 'Invalid JSON.');
  return value;
}

async function readBytes(request, limit) {
  required(request.body && Number(request.headers.get('content-length') || 0) <= limit, 413, 'Upload exceeds the allowed size.');
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RequestError(413, 'Upload exceeds the allowed size.');
    }
    parts.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function db(env, statement, ...values) {
  return env.DB.prepare(statement).bind(...values);
}
async function rows(env, statement, ...values) {
  return (await db(env, statement, ...values).all()).results;
}
async function profile(env, user) {
  if (!user.id) return null;
  return db(env, 'SELECT name, focus, goal, created FROM profiles WHERE id = ?', user.id).first();
}
function member(user) {
  required(user.id, 401, 'Sign in with ChatGPT to continue.');
}
async function registered(env, user) {
  member(user);
  required(await profile(env, user), 409, 'Create your profile from Account first.');
}
function administrator(user) {
  required(user.admin, 403, 'Admin access required.');
}

const postFields = `p.id, p.title, p.body, p.topic, p.created, u.name,
  (p.author = ?) AS mine,
  (SELECT COUNT(*) FROM comments c WHERE c.post = p.id) AS comments,
  (SELECT COUNT(*) FROM reactions r WHERE r.post = p.id AND r.kind = 'like') AS likes,
  (SELECT COUNT(*) FROM reactions r WHERE r.post = p.id AND r.kind = 'helpful') AS helpful,
  (SELECT kind FROM reactions r WHERE r.post = p.id AND r.author = ?) AS myReaction,
  EXISTS(SELECT 1 FROM bookmarks b WHERE b.post = p.id AND b.author = ?) AS saved`;
const postFrom = 'FROM posts p JOIN profiles u ON u.id = p.author';
async function feed(env, user, where, values, order, limit) {
  return rows(env, `SELECT ${postFields} ${postFrom} ${where} ORDER BY ${order} LIMIT ?`, user.id, user.id, user.id, ...values, limit);
}

function parseEditorial(data) {
  if (data?.schemaVersion !== 1 || !Number.isFinite(Date.parse(data.checkedAt)) ||
      !Array.isArray(data.notices) || !Array.isArray(data.study) ||
      data.notices.length > 80 || data.study.length > 60) throw new Error('Invalid editorial document.');
  const items = (entries, categories, requiresSource) => {
    const ids = new Set();
    return entries.map(entry => {
      const {id, category, title, summary, source, publishedAt} = entry;
      const url = safeLink(entry.url);
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,89}$/.test(id) || ids.has(id) ||
          !categories.includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ||
          !Number.isFinite(Date.parse(publishedAt)) || (requiresSource && !url)) throw new Error('Invalid editorial item.');
      ids.add(id);
      return { id, category, title: clean(title, 160, 1), summary: clean(summary, 800, 1),
        source: clean(source, 100, 1), url, created: Date.parse(publishedAt), origin: 'Editorial' };
    });
  };
  return { checkedAt: data.checkedAt, notice: items(data.notices, noticeTypes, true), study: items(data.study, studyTypes, false) };
}

let editorialCache;
let editorialRequest;
async function editorial() {
  if (editorialCache?.expires > Date.now()) return editorialCache.data;
  editorialRequest ??= (async () => {
    try {
      const result = await fetch(editorialUrl, { signal: AbortSignal.timeout(4500), headers: {'Accept': 'application/json'} });
      if (!result.ok) throw new Error('GitHub feed unavailable.');
      const source = await result.text();
      if (source.length > 260000) throw new Error('GitHub feed exceeds size limit.');
      const data = { ...parseEditorial(JSON.parse(source)), live: true };
      editorialCache = { data, expires: Date.now() + 60000 };
    } catch {
      const data = editorialCache?.data ?? parseEditorial(assets.editorial);
      editorialCache = { data: {...data, live: false}, expires: Date.now() + 20000 };
    } finally {
      editorialRequest = null;
    }
    return editorialCache.data;
  })();
  return editorialRequest;
}

function validFile(bytes, type) {
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const magic = type === 'image/png' ? [137,80,78,71,13,10,26,10] : [255,216,255];
  return magic.every((byte, index) => bytes[index] === byte);
}

async function fileDesk(request, env, user, id) {
  await registered(env, user);
  const prefix = `users/${user.id}/`;
  if (!id && request.method === 'GET') {
    const list = await env.BUCKET.list({prefix, limit:12, include:['customMetadata']});
    return json(list.objects.map(file => ({id:file.key.slice(prefix.length),
      name:file.customMetadata?.name || 'Document', size:file.size, uploaded:file.uploaded})));
  }
  if (!id && request.method === 'POST') {
    const type = request.headers.get('content-type');
    required(fileTypes[type], 415, 'Upload a PDF, PNG or JPEG.');
    let label = '';
    try { label = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch {}
    const name = clean(label.replace(/[\x00-\x1f\x7f]/g, ''), 150, 1);
    const bytes = await readBytes(request, sizeLimit);
    required(validFile(bytes, type), 415, 'The file content does not match its format.');
    const existing = await env.BUCKET.list({prefix, limit:12});
    const occupied = new Set(existing.objects.map(file => file.key));
    for (let slot = 1; slot <= 12; slot++) {
      const key = prefix + slot;
      if (occupied.has(key)) continue;
      const result = await env.BUCKET.put(key, bytes, {onlyIf: {etagDoesNotMatch:'*'},
        httpMetadata:{contentType:type}, customMetadata:{name}});
      if (result) return json({id:String(slot)}, 201);
    }
    throw new RequestError(409, 'File Desk is full. Delete a file before adding another.');
  }
  required(id && /^(?:[1-9]|1[0-2])$/.test(id), 404, 'File not found.');
  if (request.method === 'DELETE') {
    await env.BUCKET.delete(prefix + id);
    return json({ok:true});
  }
  required(request.method === 'GET', 405, 'Method not allowed.');
  const file = await env.BUCKET.get(prefix + id);
  required(file, 404, 'File not found.');
  const name = file.customMetadata?.name || 'Document';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  return response(file.body, 'application/octet-stream', {
    headers: {'Content-Disposition': "attachment; filename*=UTF-8''" + encoded, 'Content-Security-Policy': "sandbox"},
  });
}

async function api(request, env, url, user) {
  const route = url.pathname;
  const method = request.method;
  const now = Date.now();
  const id = crypto.randomUUID();
  if (method !== 'GET') {
    required(['POST','PUT','DELETE'].includes(method), 405, 'Method not allowed.');
    required(request.headers.get('origin') === url.origin, 403, 'Use the Site to perform this action.');
  }
  if (route === '/api/session' && method === 'GET') return json({ signedIn: Boolean(user.id), admin: user.admin, profile: await profile(env,user) });
  if (route === '/api/profile' && method === 'PUT') {
    member(user);
    const data = await input(request);
    const name = clean(data.name, 55, 2);
    await db(env, `INSERT INTO profiles(id,name,focus,goal,created) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,focus=excluded.focus,goal=excluded.goal`,
      user.id, name, clean(data.focus, 80), clean(data.goal, 500), now).run();
    return json({ok:true});
  }
  if (route === '/api/feed' && method === 'GET') {
    const topic = url.searchParams.get('topic');
    const before = Number(url.searchParams.get('before') || now + 1);
    required(Number.isSafeInteger(before), 400, 'Invalid page cursor.');
    const where = topics.includes(topic) ? 'WHERE p.created < ? AND p.topic = ?' : 'WHERE p.created < ?';
    return json(await feed(env,user,where,topics.includes(topic)?[before,topic]:[before],'p.created DESC, p.id',25));
  }
  if (route === '/api/top' && method === 'GET') {
    return json(await feed(env,user,'WHERE p.created >= ?',[now-7*86400000],'(likes+helpful+comments) DESC, p.created DESC',8));
  }
  if (route === '/api/feed' && method === 'POST') {
    await registered(env,user);
    const data = await input(request);
    required(topics.includes(data.topic), 400, 'Choose a topic.');
    const recent = await db(env,'SELECT COUNT(*) AS n FROM posts WHERE author=? AND created>?', user.id, now-3600000).first();
    required(recent.n < 12, 429, 'Hourly post limit reached.');
    await db(env,'INSERT INTO posts VALUES(?,?,?,?,?,?)', id,user.id,clean(data.title,120,3),clean(data.body,4000,3),data.topic,now).run();
    return json({id},201);
  }
  const post = route.match(/^\/api\/posts\/([a-f0-9-]{36})(?:\/(comments|reaction|bookmark)(?:\/([a-f0-9-]{36}))?)?$/);
  if (post) {
    const [,postId,action,commentId] = post;
    const record = await db(env,'SELECT author FROM posts WHERE id=?',postId).first();
    required(record,404,'Post not found.');
    if (!action && method === 'GET') return json((await feed(env,user,'WHERE p.id=?',[postId],'p.created DESC',1))[0]);
    if (!action && method === 'DELETE') {
      member(user);
      required(user.admin || record.author === user.id,403,'You cannot delete this post.');
      await db(env,'DELETE FROM posts WHERE id=?',postId).run();
      return json({ok:true});
    }
    if (action === 'comments' && method === 'GET') return json(await rows(env,`SELECT c.id,c.body,c.created,p.name,(c.author=?) AS mine
      FROM comments c JOIN profiles p ON p.id=c.author WHERE c.post=? ORDER BY c.created DESC LIMIT 100`,user.id,postId));
    await registered(env,user);
    if (action === 'comments' && method === 'POST' && !commentId) {
      const {body} = await input(request);
      const recent = await db(env,'SELECT COUNT(*) AS n FROM comments WHERE author=? AND created>?',user.id,now-3600000).first();
      required(recent.n < 40,429,'Hourly comment limit reached.');
      await db(env,'INSERT INTO comments VALUES(?,?,?,?,?)',id,postId,user.id,clean(body,1000,1),now).run();
      return json({id},201);
    }
    if (action === 'comments' && method === 'DELETE' && commentId) {
      const author = await db(env,'SELECT author FROM comments WHERE id=? AND post=?',commentId,postId).first();
      required(author && (user.admin || author.author === user.id),403,'You cannot delete this comment.');
      await db(env,'DELETE FROM comments WHERE id=? AND post=?',commentId,postId).run();
      return json({ok:true});
    }
    if (action === 'reaction' && method === 'PUT') {
      const {kind} = await input(request);
      required(['like','helpful',null].includes(kind),400,'Invalid reaction.');
      if (kind === null) await db(env,'DELETE FROM reactions WHERE post=? AND author=?',postId,user.id).run();
      else await db(env,`INSERT INTO reactions VALUES(?,?,?) ON CONFLICT(post,author) DO UPDATE SET kind=excluded.kind`,postId,user.id,kind).run();
      return json({ok:true});
    }
    if (action === 'bookmark' && method === 'PUT') {
      const {saved} = await input(request);
      required(typeof saved === 'boolean',400,'Invalid bookmark.');
      if (saved) await db(env,'INSERT OR IGNORE INTO bookmarks VALUES(?,?)',postId,user.id).run();
      else await db(env,'DELETE FROM bookmarks WHERE post=? AND author=?',postId,user.id).run();
      return json({ok:true});
    }
  }
  if ((route === '/api/notice' || route === '/api/study') && method === 'GET') {
    const section = route.slice(5);
    const [editorialData, adminItems] = await Promise.all([editorial(), rows(env,`SELECT *, 'Admin' AS origin, 'Site admin' AS source
      FROM resources WHERE section=? ORDER BY created DESC LIMIT 80`,section)]);
    return json({ items: [...adminItems,...editorialData[section]].sort((a,b)=>b.created-a.created),
      checkedAt:editorialData.checkedAt, live:editorialData.live });
  }
  if (route === '/api/admin/resources' && method === 'POST') {
    administrator(user);
    const data = await input(request);
    const types = data.section === 'notice' ? noticeTypes : data.section === 'study' ? studyTypes : [];
    required(types.includes(data.category),400,'Choose a valid category.');
    const link = safeLink(data.url);
    required(data.section !== 'notice' || link,400,'Notices require an HTTPS source.');
    await db(env,'INSERT INTO resources VALUES(?,?,?,?,?,?,?)',id,data.section,data.category,clean(data.title,160,3),clean(data.summary,800,3),link,now).run();
    return json({id},201);
  }
  const resource = route.match(/^\/api\/admin\/resources\/([a-f0-9-]{36})$/);
  if (resource && method === 'DELETE') {
    administrator(user);
    await db(env,'DELETE FROM resources WHERE id=?',resource[1]).run();
    return json({ok:true});
  }
  if (route === '/api/account' && method === 'GET') {
    await registered(env,user);
    const [saved, posts, tickets] = await Promise.all([
      feed(env,user,'WHERE EXISTS(SELECT 1 FROM bookmarks b WHERE b.post=p.id AND b.author=?)',[user.id],'p.created DESC',50),
      feed(env,user,'WHERE p.author=?',[user.id],'p.created DESC',50),
      rows(env,'SELECT id,subject,body,answer,created FROM tickets WHERE owner=? ORDER BY created DESC LIMIT 50',user.id),
    ]);
    return json({saved,posts,tickets});
  }
  if (route === '/api/tickets' && method === 'POST') {
    await registered(env,user);
    const data = await input(request);
    const recent = await db(env,'SELECT COUNT(*) AS n FROM tickets WHERE owner=? AND created>?',user.id,now-86400000).first();
    required(recent.n < 6,429,'Daily request limit reached.');
    await db(env,'INSERT INTO tickets(id,owner,subject,body,created) VALUES(?,?,?,?,?)',id,user.id,clean(data.subject,120,3),clean(data.body,1800,3),now).run();
    return json({id},201);
  }
  if (route === '/api/admin/tickets' && method === 'GET') {
    administrator(user);
    return json(await rows(env,`SELECT t.id,t.subject,t.body,t.answer,t.created,p.name FROM tickets t
      JOIN profiles p ON p.id=t.owner ORDER BY (t.answer IS NULL) DESC,t.created DESC LIMIT 100`));
  }
  const ticket = route.match(/^\/api\/admin\/tickets\/([a-f0-9-]{36})$/);
  if (ticket && method === 'PUT') {
    administrator(user);
    const {answer} = await input(request);
    await db(env,'UPDATE tickets SET answer=? WHERE id=?',clean(answer,1800,3),ticket[1]).run();
    return json({ok:true});
  }
  const file = route.match(/^\/api\/files(?:\/(\d+))?$/);
  if (file) return fileDesk(request,env,user,file[1]);
  throw new RequestError(404,'Not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = request.headers.get('oai-authenticated-user-id') || '';
    const email = request.headers.get('oai-authenticated-user-email') || '';
    const user = {id, admin:Boolean(id && email && env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase())};
    try {
      if (url.pathname.startsWith('/api/')) return await api(request,env,url,user);
      if (url.pathname === '/styles.css') return response(assets.css,'text/css; charset=utf-8');
      if (url.pathname === '/client.js') return response(assets.client,'application/javascript; charset=utf-8');
      if (url.pathname === '/private/admission-tracker') {
        administrator(user);
        required(assets.legacy,404,'Archive unavailable.');
        return response(assets.legacy,'text/html; charset=utf-8', {headers:{'X-Robots-Tag':'noindex, nofollow'}});
      }
      required(url.pathname === '/',404,'Not found.');
      return response(assets.html,'text/html; charset=utf-8',{headers:{
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'",
      }});
    } catch (error) {
      if (error instanceof RequestError) return json({error:error.message},error.status);
      console.error('Portal request failed',url.pathname,error.name);
      return json({error:'Temporarily unavailable. Please try again.'},500);
    }
  },
};
