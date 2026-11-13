function admissionById(id) {
  return assets.admissions.find(item => item.id === id);
}

async function admissionCalendar(env) {
  const revisions = await rows(env, `SELECT circular,payload,created,id FROM (SELECT circular,payload,created,id,
    ROW_NUMBER() OVER (PARTITION BY circular ORDER BY id DESC) AS n FROM admission_revisions) WHERE n<=8 ORDER BY id DESC`);
  return assets.admissions.map(base => {
    const history = revisions.filter(revision => revision.circular === base.id);
    const current = history.length ? JSON.parse(history[0].payload).after : {};
    return { ...base, ...current, revision: history[0]?.id ?? 0,
      history: history.slice(0, 8).map(row => ({ ...JSON.parse(row.payload), created: row.created })) };
  });
}

function checkedAdmissionDate(value) {
  if (value === '' || value === null) return null;
  required(typeof value === 'string' && isRealDate(value.slice(0, 10)) &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d\+06:00$/.test(value)), 400,
    'Use YYYY-MM-DD or YYYY-MM-DDTHH:mm+06:00.');
  return value;
}

route('GET', '/api/admissions', async c => json(await admissionCalendar(c.env)));

route('GET', '/api/admission-plans', async c => {
  hasProfile(c.user);
  const [items, plans, reminder] = await Promise.all([
    admissionCalendar(c.env),
    rows(c.env, 'SELECT circular, stage, updated FROM admission_plans WHERE owner = ? ORDER BY updated DESC', c.user.id),
    one(c.env, 'SELECT enabled, email FROM admission_reminders WHERE owner = ?', c.user.id),
  ]);
  return json({ items, plans, optedIn: !!reminder?.enabled, reminderAvailable: remindersEnabled(c.env) && Boolean(c.user.email) });
});

route('PUT', '/api/admission-plans/:id', async c => {
  writer(c.user, await getSettings(c.env));
  required(admissionById(c.params.id), 404, 'Circular not found.');
  const { stage } = await input(c.request);
  required(Object.hasOwn(admissionStages, stage), 400, 'Unknown stage.');
  await db(c.env, 'INSERT INTO admission_plans VALUES(?,?,?,?) ON CONFLICT(owner,circular) DO UPDATE SET stage=excluded.stage,updated=excluded.updated',
    c.user.id, c.params.id, stage, c.now).run();
  return json({ ok: true });
});

route('DELETE', '/api/admission-plans/:id', async c => {
  hasProfile(c.user);
  await db(c.env, 'DELETE FROM admission_plans WHERE owner=? AND circular=?', c.user.id, c.params.id).run();
  return json({ ok: true });
});

route('PUT', '/api/admission-reminders', async c => {
  hasProfile(c.user);
  const { enabled } = await input(c.request);
  required(typeof enabled === 'boolean', 400, 'Choose on or off.');
  if (enabled) {
    writer(c.user, await getSettings(c.env));
    required(remindersEnabled(c.env) && c.user.email, 503, 'Email delivery is unavailable.');
    await db(c.env, 'INSERT INTO admission_reminders VALUES(?,?,1,?) ON CONFLICT(owner) DO UPDATE SET email=excluded.email,enabled=1,opted_in=excluded.opted_in',
      c.user.id, c.user.email, c.now).run();
  } else {
    await db(c.env, 'DELETE FROM admission_reminders WHERE owner=?', c.user.id).run();
  }
  return json({ ok: true });
});

route('GET', '/api/admin/admissions', async c => {
  need(c.user, 2);
  return json({ items: await admissionCalendar(c.env), snapshots: await rows(c.env, 'SELECT * FROM admission_snapshots ORDER BY checked DESC') });
});

route('POST', '/api/admin/admissions/:id', async c => {
  need(c.user, 2);
  const base = admissionById(c.params.id);
  required(base, 404, 'Circular not found.');
  const data = await input(c.request);
  const current = (await admissionCalendar(c.env)).find(item => item.id === base.id);
  required(current.revision === data.revision, 409, 'A newer revision exists. Reload and review again.');
  const before = Object.fromEntries(Object.keys(admissionDates).map(key => [key, current[key]]));
  const after = Object.fromEntries(Object.keys(admissionDates).map(key => [key, checkedAdmissionDate(data[key])]));
  const evidence = clean(data.evidence, 650, 12);
  required(!after.start || !after.end || Date.parse(after.start) <= Date.parse(after.end), 400, 'Application end must follow the start.');
  const snapshot = await one(c.env, 'SELECT hash, reviewed_hash FROM admission_snapshots WHERE circular=?', base.id);
  required(!data.hash || data.hash === snapshot?.hash, 409, 'Source changed during review. Reload.');
  const changed = Object.keys(before).some(key => before[key] !== after[key]);
  const statements = [];
  if (changed) statements.push(db(c.env, `INSERT INTO admission_revisions(circular,payload,approved_by,created)
    SELECT ?,?,?,? WHERE COALESCE((SELECT MAX(id) FROM admission_revisions WHERE circular=?),0)=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM admission_snapshots WHERE circular=? AND hash=?))`,
    base.id, JSON.stringify({ before, after: { ...after, evidence }, evidence }), c.user.id, c.now, base.id, current.revision, data.hash || null, base.id, data.hash || null));
  if (data.hash && (changed || snapshot.reviewed_hash !== data.hash)) statements.push(db(c.env, `UPDATE admission_snapshots SET reviewed_hash=? WHERE circular=? AND hash=?
    AND (?=0 OR changes()=1)`, data.hash, base.id, data.hash, changed ? 1 : 0));
  required(statements.length, 400, 'No changes to publish.');
  const results = await c.env.DB.batch(statements);
  required(results[0].meta.changes === 1, 409, 'A newer revision or source exists.');
  await audit(c.env, c.user, changed ? 'admission.publish' : 'admission.review', 'circular', base.id, evidence);
  return json({ ok: true });
});

route('POST', '/api/admin/admission-scan', async c => {
  need(c.user, 2);
  return json(await syncAdmissionObservations(c.env));
});

async function syncAdmissionObservations(env) {
  const target = 'https://raw.githubusercontent.com/ruhulaminrevens/Academic-Admission/main/data/admission-observations.json';
  const result = await fetch(target, { signal: AbortSignal.timeout(6000) });
  required(result.ok, 502, 'Source observations are unavailable.');
  const data = JSON.parse(new TextDecoder().decode(await readBytes(result, 28000)));
  required(Array.isArray(data) && data.length <= 40, 502, 'Source observations are invalid.');
  let count = 0;
  for (const row of data) {
    if (!row || !admissionById(row.id) || !/^[a-f0-9]{64}$/.test(row.hash) || typeof row.excerpt !== 'string' ||
        !Number.isSafeInteger(row.checked) || row.checked > Date.now() + 300000) continue;
    const updated = await db(env, `INSERT INTO admission_snapshots VALUES(?,?,?,?,NULL)
      ON CONFLICT(circular) DO UPDATE SET hash=excluded.hash,excerpt=excluded.excerpt,checked=excluded.checked
      WHERE excluded.checked > admission_snapshots.checked`, row.id, row.hash, row.excerpt.slice(0, 4000), row.checked).run();
    count += updated.meta.changes;
  }
  return { observations: count };
}

const remindersEnabled = env => Boolean(env.RESEND_API_KEY && env.REMINDER_FROM && env.ADMISSION_JOB_SECRET && env.SITE_URL);
const reminderDay = 86400000;

async function deliverAdmissionReminders(env, now) {
  if (!remindersEnabled(env)) return { sent: 0, failed: 0, emailConfigured: false };
  const [items, plans] = await Promise.all([
    admissionCalendar(env),
    rows(env, `SELECT p.owner,p.circular,p.stage,p.updated,r.email,r.opted_in FROM admission_plans p
      JOIN admission_reminders r ON r.owner=p.owner AND r.enabled=1 JOIN profiles u ON u.id=p.owner AND u.status='active'
      WHERE p.stage IN ('shortlist','applied')`),
  ]);
  let sent = 0, failed = 0, attempted = 0;
  for (const plan of plans) {
    const item = items.find(candidate => candidate.id === plan.circular);
    const deadline = item?.end?.length > 10 ? Date.parse(item.end) : NaN;
    const remaining = deadline - now;
    const options = [];
    if (remaining > 0 && remaining <= 7 * reminderDay) options.push([remaining <= reminderDay ? '24h' : '7d', 'আবেদনের শেষ সময়']);
    const change = item?.history[0];
    if (change && change.before.end !== change.after.end && change.created >= plan.opted_in &&
      change.created >= plan.updated && change.created + reminderDay > now) options.push(['correction', 'আবেদনের সময় পরিবর্তিত হয়েছে']);
    for (const [kind, label] of options) {
      if (attempted >= 25) return { sent, failed, emailConfigured: true };
      const event = [item.id, item.end || 'unknown', kind, kind === 'correction' ? item.revision : ''].join('/');
      await db(env, 'INSERT OR IGNORE INTO admission_mail(owner,event,started) VALUES(?,?,?)', plan.owner, event, now).run();
      const delivery = await one(env, 'SELECT started,sent FROM admission_mail WHERE owner=? AND event=?', plan.owner, event);
      if (!delivery || delivery.sent || now - delivery.started >= 23 * 3600000) continue;
      const active = await one(env, `SELECT 1 AS ok FROM admission_reminders r JOIN admission_plans p ON p.owner=r.owner
        JOIN profiles u ON u.id=r.owner WHERE r.owner=? AND p.circular=? AND r.email=? AND r.enabled=1 AND p.stage IN ('shortlist','applied')
        AND u.status='active' AND COALESCE((SELECT MAX(id) FROM admission_revisions WHERE circular=?),0)=?`,
        plan.owner, item.id, plan.email, item.id, item.revision);
      if (!active) continue;
      attempted++;
      try {
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(4000), redirect: 'error',
          headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json',
            'Idempotency-Key': await sha256Hex(plan.owner + '/' + event) },
          body: JSON.stringify({ from: env.REMINDER_FROM, to: [plan.email], subject: label + ' — ' + item.institution,
            text: item.institution + ' · ' + item.unit + '\n' + label + ': ' + admissionDateLabel(item.end) +
              '\nমূল বিজ্ঞপ্তি: ' + item.source + '\nReminder settings: ' + new URL('/applications', env.SITE_URL).href }),
        });
        if (!result.ok) { failed++; continue; }
        await db(env, 'UPDATE admission_mail SET sent=? WHERE owner=? AND event=?', Date.now(), plan.owner, event).run();
        sent++;
      } catch { failed++; }
    }
  }
  return { sent, failed, emailConfigured: true };
}

route('POST', '/api/hooks/admission-jobs', async c => {
  const key = c.env.ADMISSION_JOB_SECRET;
  const stamp = c.request.headers.get('x-timestamp') || '';
  const sig = c.request.headers.get('x-signature') || '';
  required(key && /^\d{10}$/.test(stamp) && Math.abs(c.now / 1000 - Number(stamp)) < 300 &&
    safeEqual(sig, await hmacHex(key, stamp + '.admission-jobs')), 401, 'Invalid job signature.');
  let scan;
  try { scan = await syncAdmissionObservations(c.env); } catch { scan = { unavailable: true }; }
  const reminders = await deliverAdmissionReminders(c.env, c.now);
  return json({ scan, reminders });
}, { signed: true });
