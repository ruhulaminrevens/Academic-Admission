// ---- Admin console (client-rendered): moderators see Moderation; admins everything operational; the Super Admin also settings, audit and export ----

const dayShort = day => { const d = new Date(day + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

function lineChart(series, keys, labels, { height = 190 } = {}) {
  const W = 560, H = height, P = { l: 34, r: 10, t: 12, b: 24 };
  const max = Math.max(1, ...series.flatMap(row => keys.map(k => row[k] || 0)));
  const nice = Math.max(4, Math.ceil(max / 4) * 4);
  const x = i => P.l + (series.length < 2 ? 0 : (i / (series.length - 1)) * (W - P.l - P.r));
  const y = v => P.t + (1 - v / nice) * (H - P.t - P.b);
  const grid = [0, 1, 2, 3, 4].map(i => { const v = (nice / 4) * i; return `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end">${compactNumber(v)}</text>`; }).join('');
  const every = Math.ceil(series.length / 6);
  const ticks = series.map((row, i) => ((i % every === 0 && series.length - 1 - i >= every - 1) || i === series.length - 1) ? `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}">${dayShort(row.day)}</text>` : '').join('');
  const paths = keys.map((key, k) => {
    const pts = series.map((row, i) => [x(i), y(row[key] || 0)]);
    const line = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`;
    const dots = pts.map(([px, py], i) => `<circle class="dot s${k}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"><title>${labels[k]} · ${dayShort(series[i].day)}: ${series[i][key] || 0}</title></circle>`).join('');
    return `<path class="area s${k}" d="${area}"/><path class="line s${k}" d="${line}"/>${dots}`;
  }).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.join(', ')} over time" preserveAspectRatio="none">${grid}${ticks}${paths}</svg>
    <figcaption class="legend">${labels.map((label, k) => `<span><i class="s${k}"></i>${label}</span>`).join('')}</figcaption></figure>`;
}

const barList = (rowsList, total, empty = 'No data yet.') => rowsList.length ? `<ul class="bars">${rowsList.map(r => {
  const pct = total ? Math.max(3, Math.round((r.views / total) * 100)) : 0;
  return `<li><div class="bar-label"><span>${esc(r.label ?? r.key ?? r.path)}</span><b>${(r.views || 0).toLocaleString('en')}</b></div><div class="bar"><i data-w="${pct}"></i></div></li>`;
}).join('')}</ul>` : `<p class="muted small">${empty}</p>`;

function paintBars(root) { $$('.bar i[data-w]', root).forEach(el => { el.style.setProperty('--w', el.dataset.w + '%'); }); }

const statTile = (label, value, ic, tone = '') => `<div class="card stat-tile ${tone}" data-reveal><span class="stat-ico">${icon(ic, 20)}</span><div><b>${Number(value || 0).toLocaleString('en')}</b><span>${label}</span></div></div>`;

const adminTabs = [
  { key: 'overview', label: 'Overview', ic: 'grid', rank: 2 },
  { key: 'analytics', label: 'Analytics', ic: 'chart', rank: 2 },
  { key: 'moderation', label: 'Moderation', ic: 'flag', rank: 1 },
  { key: 'content', label: 'Content', ic: 'file', rank: 2 },
  { key: 'members', label: 'Members', ic: 'users', rank: 2 },
  { key: 'desk', label: 'Info Desk', ic: 'mail', rank: 2 },
  { key: 'ai', label: 'AI workflow', ic: 'sparkle', rank: 2 },
  { key: 'settings', label: 'Settings', ic: 'sliders', rank: 3 },
  { key: 'audit', label: 'Audit log', ic: 'list', rank: 3 },
  { key: 'export', label: 'Export', ic: 'download', rank: 3 },
];

async function renderAdmin(view) {
  const { signedIn, rank } = S.session;
  if (!signedIn || rank < 1) {
    view.innerHTML = `<section class="container narrow notfound"><div class="notfound-art">${icon('lock', 56)}</div><h1 id="heading" tabindex="-1">Restricted</h1><p class="lead">${signedIn ? 'আপনার এই পাতা দেখার অনুমতি নেই।' : 'এই পাতা দেখতে sign in করুন।'}</p>
      ${signedIn ? '<a class="btn btn--primary" href="/" data-link>Home</a>' : '<a class="btn btn--primary" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">Sign in with ChatGPT</a>'}</section>`;
    return;
  }
  const tabs = adminTabs.filter(t => rank >= t.rank);
  const wanted = new URLSearchParams(location.search).get('tab');
  let current = tabs.find(t => t.key === wanted)?.key || tabs[0].key;
  view.innerHTML = `<section class="container admin">
    <div class="admin-head" data-reveal><div><span class="eyebrow">${rank >= 3 ? 'Super Admin' : rank >= 2 ? 'Admin' : 'Moderator'}</span><h1 id="heading" tabindex="-1">Control center</h1></div>
      <span class="live live--ok"><i></i>${esc(S.session.profile?.name || 'Admin')}</span></div>
    <div class="admin-layout"><nav class="admin-nav" aria-label="Admin sections">${tabs.map(t => `<button type="button" class="admin-tab" data-admin="${t.key}">${icon(t.ic, 18)}<span>${t.label}</span><b class="badge" data-badge="${t.key}" hidden></b></button>`).join('')}</nav>
      <div class="admin-main" id="adminMain" aria-live="polite"></div></div></section>`;
  const main = $('#adminMain');
  const show = async key => {
    current = key;
    $$('.admin-tab', view).forEach(tab => tab.classList.toggle('active', tab.dataset.admin === key));
    const url = new URL(location.href); url.searchParams.set('tab', key); history.replaceState(history.state, '', url);
    main.innerHTML = '<div class="skeleton skeleton--block"></div>';
    try { await adminPanels[key](main); } catch (error) { main.innerHTML = emptyState(error.message || 'Failed to load.'); fail(error); }
    $$('[data-reveal]', main).forEach(el => el.classList.add('in'));
    paintBars(main);
    initTilt();
  };
  view.onclick = event => { const tab = event.target.closest('[data-admin]'); if (tab) show(tab.dataset.admin); };
  show(current);
  if (rank >= 1) refreshBadges(view).catch(() => {});
}

async function refreshBadges(view) {
  try {
    const counts = rankedOverviewCounts(await api(S.session.rank >= 2 ? '/admin/overview' : '/admin/reports')) ;
    const set = (key, n) => { const el = $(`[data-badge="${key}"]`, view); if (el) { el.textContent = n; el.hidden = !n; } };
    set('moderation', counts.openReports); set('desk', counts.openTickets);
  } catch { /* badges are optional */ }
}
const rankedOverviewCounts = data => Array.isArray(data) ? { openReports: data.length, openTickets: 0 } : data.counts;

const adminPanels = {
  async overview(main) {
    const data = await api('/admin/overview');
    const c = data.counts;
    main.innerHTML = `<div class="stat-grid">${statTile('Members', c.members, 'users')}${statTile('New this week', c.newMembers, 'sparkle', 'tone-ok')}${statTile('Posts', c.posts, 'comment')}${statTile('Comments', c.comments, 'comment')}
      ${statTile('Open reports', c.openReports, 'flag', c.openReports ? 'tone-warn' : '')}${statTile('Open requests', c.openTickets, 'mail', c.openTickets ? 'tone-warn' : '')}${statTile('Suspended', c.suspended, 'ban')}${statTile('Published items', c.resources, 'file')}</div>
      <div class="layout layout--even"><div class="card" data-reveal><h2>${icon('eye', 18)} Traffic · 14 days</h2>${lineChart(data.series, ['views', 'visitors'], ['Page views', 'Visitors'])}</div>
      <div class="card" data-reveal><h2>${icon('users', 18)} Community · 14 days</h2>${lineChart(data.series, ['signups', 'posts', 'comments'], ['Sign-ups', 'Posts', 'Comments'])}</div></div>
      <div class="card feed-status" data-reveal><span class="live live--${data.feed.live ? 'ok' : 'warn'}"><i></i>${data.feed.live ? 'Editorial feed live' : 'Using saved snapshot'}</span><span class="muted">Last checked ${esc(timeAgo(Date.parse(data.feed.checkedAt), Date.now()))}</span></div>`;
  },

  async analytics(main, days = 30) {
    const d = await api('/admin/analytics?days=' + days);
    const totalViews = d.totals.views;
    main.innerHTML = `<div class="admin-toolbar"><div class="chips">${[7, 30, 90].map(n => `<button class="chip-btn" type="button" data-days="${n}" aria-pressed="${n === days}">${n} days</button>`).join('')}</div>
      <span class="muted small">Cookie-less · no IP stored · respects Do Not Track</span></div>
      <div class="stat-grid stat-grid--3">${statTile('Page views', d.totals.views, 'eye')}${statTile('Visitor-days', d.totals.visitorDays, 'users')}${statTile('Views / visitor', d.totals.visitorDays ? (d.totals.views / d.totals.visitorDays).toFixed(1) : 0, 'chart')}</div>
      <div class="card" data-reveal><h2>${icon('chart', 18)} Traffic</h2>${lineChart(d.series, ['views', 'visitors'], ['Page views', 'Visitors'], { height: 220 })}</div>
      <div class="layout layout--even"><div class="card" data-reveal><h2>Top pages</h2>${barList(d.paths.map(p => ({ label: p.path, views: p.views })), d.paths[0]?.views || 0)}</div>
        <div class="card" data-reveal><h2>Referrers</h2>${barList(d.referrers, d.referrers[0]?.views || 0)}</div>
        <div class="card" data-reveal><h2>Devices</h2>${barList(d.devices, totalViews)}</div>
        <div class="card" data-reveal><h2>Countries</h2>${barList(d.countries.map(c => ({ label: c.key.toUpperCase(), views: c.views })), d.countries[0]?.views || 0)}</div>
        <div class="card" data-reveal><h2>Campaigns (UTM)</h2>${barList(d.campaigns, d.campaigns[0]?.views || 0, 'Add ?utm_source=…&utm_campaign=… to your links to track marketing.')}</div>
        <div class="card" data-reveal><h2>Sources &amp; mediums</h2>${barList([...d.sources, ...d.mediums], Math.max(d.sources[0]?.views || 0, d.mediums[0]?.views || 0), 'No tagged traffic yet.')}</div></div>
      <div class="card" data-reveal><h2>Most viewed posts</h2>${barList(d.posts.map(p => ({ label: p.title, views: p.views })), d.posts[0]?.views || 0, 'No post views yet.')}</div>`;
    $$('[data-days]', main).forEach(btn => btn.addEventListener('click', async () => { main.innerHTML = '<div class="skeleton skeleton--block"></div>'; await adminPanels.analytics(main, Number(btn.dataset.days)); $$('[data-reveal]', main).forEach(el => el.classList.add('in')); paintBars(main); }));
  },

  async moderation(main, status = 'open') {
    const list = await api('/admin/reports?status=' + status);
    main.innerHTML = `<div class="admin-toolbar"><div class="chips">${['open', 'resolved', 'dismissed'].map(s => `<button class="chip-btn" type="button" data-status="${s}" aria-pressed="${s === status}">${s}</button>`).join('')}</div></div>
      <div class="stack">${list.length ? list.map(r => `<article class="card report" data-report="${esc(r.id)}"><div class="notice-top"><span class="chip chip--${esc(r.reason)}">${esc(r.reason)}</span><span class="tag">${esc(r.kind)}</span><span class="muted small">${esc(timeAgo(r.created, Date.now()))} · by ${esc(r.reporter)}</span></div>
        <h3>${esc(r.excerpt || '(content removed)')}</h3>${r.preview ? `<p class="muted">${esc(r.preview)}</p>` : ''}
        <p class="muted small">Author: ${esc(r.author || 'unknown')}${r.detail ? ` · “${esc(r.detail)}”` : ''}</p>
        ${r.status === 'open' ? `<div class="notice-actions"><a class="btn btn--ghost btn--sm" href="/post/${esc(r.post)}" data-link target="_blank">${icon('external', 14)}View</a>
          <button class="btn btn--ghost btn--sm" type="button" data-rep="dismissed">Dismiss</button><button class="btn btn--ghost btn--sm" type="button" data-rep="resolved">Mark resolved</button>
          <button class="btn btn--danger btn--sm" type="button" data-rep="delete">${icon('trash', 14)}Delete content</button></div>` : `<p class="muted small">${esc(r.status)} ${r.handled ? '· ' + esc(timeAgo(r.handled, Date.now())) : ''}</p>`}</article>`).join('') : emptyState(status === 'open' ? 'কোনো open report নেই — সব ঠিক আছে! 🎉'.replace(' 🎉', '') : 'Nothing here.')}</div>`;
    $$('[data-status]', main).forEach(btn => btn.addEventListener('click', () => adminPanels.moderation(main, btn.dataset.status).then(() => paintBars(main))));
    main.onclick = async event => {
      const btn = event.target.closest('[data-rep]');
      if (!btn) return;
      const row = btn.closest('[data-report]'), kind = btn.dataset.rep;
      if (kind === 'delete' && !(await confirmDialog('Delete reported content?', 'The post or comment is removed permanently.', 'Delete', true))) return;
      await busy(btn, async () => {
        await api('/admin/reports/' + row.dataset.report, { method: 'PUT', body: kind === 'delete' ? { status: 'resolved', action: 'delete' } : { status: kind } });
        toast('Report updated', 'success', 1800);
        await adminPanels.moderation(main, status);
        refreshBadges($('.admin'));
      });
    };
  },

  async content(main) {
    const items = await api('/admin/resources');
    const formHtml = item => `<form class="card form" id="resourceForm" data-reveal><h2>${icon(item ? 'edit' : 'upload', 18)} ${item ? 'Edit item' : 'Publish new item'}</h2>
      <div class="field-row"><label>Section<select name="section"><option value="notice"${item?.section === 'notice' ? ' selected' : ''}>Notice</option><option value="study"${item?.section === 'study' ? ' selected' : ''}>Study</option></select></label>
      <label class="grow">Category<select name="category"></select></label></div>
      <label>Title<input name="title" required minlength="3" maxlength="160" value="${esc(item?.title || '')}"></label>
      <label>Summary<textarea name="summary" required minlength="3" maxlength="800">${esc(item?.summary || '')}</textarea></label>
      <div class="field-row"><label class="grow">Source link (HTTPS)<input name="url" type="url" maxlength="600" value="${esc(item?.url || '')}" placeholder="https://…"></label>
      <label>Deadline<input name="deadline" type="date" value="${esc(item?.deadline || '')}"></label></div>
      <label class="check"><input type="checkbox" name="pinned"${item?.pinned ? ' checked' : ''}> Pin to top</label>
      <div class="form-foot"><span class="muted small">Notices need an HTTPS source. Deadlines apply to notices only.</span><span>${item ? '<button class="btn btn--ghost" type="button" data-cancel>Cancel</button> ' : ''}<button class="btn btn--primary" type="submit">${icon('check', 16)}${item ? 'Save' : 'Publish'}</button></span></div></form>`;
    const draw = (editing = null) => {
      main.innerHTML = `${formHtml(editing)}<div class="card" data-reveal><h2>${icon('list', 18)} Published by admins <span class="muted small">(${items.length})</span></h2><div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Section</th><th>Deadline</th><th></th></tr></thead><tbody>
        ${items.map(i => `<tr data-id="${esc(i.id)}"><td><strong>${esc(truncate(i.title, 70))}</strong>${i.pinned ? ` <span class="tag tag--pin">${icon('pin', 11)}Pinned</span>` : ''}<div class="muted small">${esc(i.category)}</div></td><td>${esc(i.section)}</td><td>${i.deadline ? esc(i.deadline) : '—'}</td>
        <td class="row-actions"><button class="btn btn--ghost btn--sm" type="button" data-edit="${esc(i.id)}" aria-label="Edit">${icon('edit', 14)}</button><button class="btn btn--ghost btn--sm act--danger" type="button" data-remove="${esc(i.id)}" aria-label="Delete">${icon('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing published yet.</td></tr>'}</tbody></table></div></div>`;
      const form = $('#resourceForm'), section = form.section, category = form.category;
      const fill = () => { const list = section.value === 'notice' ? noticeTypes : studyTypes; category.innerHTML = list.map(t => `<option${editing?.category === t ? ' selected' : ''}>${esc(t)}</option>`).join(''); form.deadline.disabled = section.value !== 'notice'; };
      section.addEventListener('change', fill); fill();
      $('[data-cancel]', form)?.addEventListener('click', () => draw());
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.pinned = form.pinned.checked; data.deadline = form.deadline.disabled ? '' : data.deadline;
        await busy($('button[type="submit"]', form), async () => {
          if (editing) await api('/admin/resources/' + editing.id, { method: 'PUT', body: data }); else await api('/admin/resources', { method: 'POST', body: data });
          toast(editing ? 'Updated' : 'Published', 'success');
          main.innerHTML = '<div class="skeleton skeleton--block"></div>'; await adminPanels.content(main); $$('[data-reveal]', main).forEach(el => el.classList.add('in'));
        });
      });
      main.onclick = async event => {
        const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-remove]');
        if (edit) { draw(items.find(i => i.id === edit.dataset.edit)); scrollTo({ top: 0, behavior: 'smooth' }); }
        if (remove && await confirmDialog('Delete this item?', 'It disappears from the site immediately.', 'Delete', true)) {
          await busy(remove, async () => { await api('/admin/resources/' + remove.dataset.remove, { method: 'DELETE' }); toast('Deleted', 'success', 1800); await adminPanels.content(main); $$('[data-reveal]', main).forEach(el => el.classList.add('in')); });
        }
      };
      $$('[data-reveal]', main).forEach(el => el.classList.add('in'));
    };
    draw();
  },

  async members(main) {
    const state = { q: '', role: '', status: '' };
    main.innerHTML = `<div class="admin-toolbar"><label class="search-field">${icon('search', 18)}<input type="search" id="memberSearch" placeholder="Search members…" aria-label="Search members"></label>
      <select id="memberRole" aria-label="Role"><option value="">All roles</option>${roles.map(r => `<option value="${r}">${roleLabel[r]}</option>`).join('')}</select>
      <select id="memberStatus" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Role</th><th>Activity</th><th>Last seen</th><th></th></tr></thead><tbody id="memberRows"></tbody></table></div>
      <div class="center"><button class="btn btn--ghost" type="button" id="memberMore" hidden>Load more</button></div></div>`;
    const body = $('#memberRows'), more = $('#memberMore');
    let before = 0;
    const load = async (reset) => {
      if (reset) { before = 0; body.innerHTML = ''; }
      const params = new URLSearchParams({ ...(state.q && { q: state.q }), ...(state.role && { role: state.role }), ...(state.status && { status: state.status }), ...(before && { before }) });
      const { users, more: hasMore } = await api('/admin/users?' + params);
      body.insertAdjacentHTML('beforeend', users.map(memberRow).join('') || (reset ? '<tr><td colspan="5" class="muted">No members found.</td></tr>' : ''));
      if (users.length) before = users[users.length - 1].created;
      more.hidden = !hasMore;
    };
    const memberRow = u => {
      const canRole = S.session.rank >= 3 && u.role !== 'superadmin';
      const canStatus = S.session.rank > (roleRank[u.role] ?? 0);
      return `<tr data-user="${esc(u.id)}" data-name="${esc(u.name)}"><td><div class="member">${avatar(u.name)}<div><strong>${esc(u.name)}</strong> ${u.status === 'suspended' ? '<span class="tag tag--warn">Suspended</span>' : ''}<div class="muted small">${esc(u.focus || '—')} · joined ${esc(fmtDate(u.created))}</div></div></div></td>
        <td>${canRole ? `<select data-role aria-label="Role for ${esc(u.name)}">${['member', 'moderator', 'admin'].map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${roleLabel[r]}</option>`).join('')}</select>` : roleBadge(u.role) || '<span class="muted">Member</span>'}</td>
        <td class="muted small">${u.posts} posts · ${u.comments} comments</td><td class="muted small">${u.last_seen ? esc(timeAgo(u.last_seen, Date.now())) : '—'}</td>
        <td class="row-actions">${canStatus ? `<button class="btn btn--ghost btn--sm ${u.status === 'suspended' ? '' : 'act--danger'}" type="button" data-status="${u.status === 'suspended' ? 'active' : 'suspended'}">${u.status === 'suspended' ? 'Restore' : 'Suspend'}</button>` : ''}</td></tr>`;
    };
    $('#memberSearch').addEventListener('input', debounce(e => { state.q = e.target.value.trim(); load(true).catch(fail); }, 250));
    $('#memberRole').addEventListener('change', e => { state.role = e.target.value; load(true).catch(fail); });
    $('#memberStatus').addEventListener('change', e => { state.status = e.target.value; load(true).catch(fail); });
    more.addEventListener('click', () => busy(more, () => load(false)));
    body.addEventListener('change', async event => {
      const sel = event.target.closest('[data-role]');
      if (!sel) return;
      const row = sel.closest('tr');
      try { await api('/admin/users/' + row.dataset.user, { method: 'PUT', body: { role: sel.value } }); toast(`${row.dataset.name} is now ${roleLabel[sel.value]}`, 'success'); } catch (error) { fail(error); load(true); }
    });
    body.addEventListener('click', async event => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      const row = btn.closest('tr'), status = btn.dataset.status;
      let reason = '';
      if (status === 'suspended') { const data = await formDialog({ title: `Suspend ${row.dataset.name}?`, text: 'They will not be able to post, comment, react or upload.', danger: true, submit: 'Suspend', fields: [{ name: 'reason', label: 'Reason (kept in the audit log)', required: true, min: 3, max: 200 }] }); if (!data) return; reason = data.reason; }
      await busy(btn, async () => { await api('/admin/users/' + row.dataset.user, { method: 'PUT', body: { status, reason } }); toast(status === 'active' ? 'Member restored' : 'Member suspended', 'success'); await load(true); });
    });
    await load(true);
  },

  async desk(main, status = '') {
    const list = await api('/admin/tickets' + (status ? '?status=' + status : ''));
    main.innerHTML = `<div class="admin-toolbar"><div class="chips">${['', 'open', 'answered', 'closed'].map(s => `<button class="chip-btn" type="button" data-status="${s}" aria-pressed="${s === status}">${s || 'all'}</button>`).join('')}</div></div>
      <div class="stack">${list.length ? list.map(t => `<article class="card ticket" data-ticket="${esc(t.id)}"><div class="notice-top"><span class="deadline deadline--${t.status === 'answered' ? 'ok' : t.status === 'closed' ? 'past' : 'soon'}">${esc(t.status)}</span><span class="muted small">${esc(t.name)} · ${esc(fmtDateTime(t.created))}</span></div>
        <h3>${esc(t.subject)}</h3><p>${esc(t.body)}</p>${t.answer ? `<div class="answer">${icon('shield', 16)}<div><strong>Reply</strong><p>${esc(t.answer)}</p></div></div>` : ''}
        <div class="notice-actions"><button class="btn btn--primary btn--sm" type="button" data-reply>${icon('send', 14)}${t.answer ? 'Edit reply' : 'Reply'}</button>
        <button class="btn btn--ghost btn--sm" type="button" data-set="${t.status === 'closed' ? 'open' : 'closed'}">${t.status === 'closed' ? 'Reopen' : 'Close'}</button></div></article>`).join('') : emptyState('কোনো request নেই।')}</div>`;
    $$('[data-status]', main).forEach(btn => btn.addEventListener('click', () => adminPanels.desk(main, btn.dataset.status).then(() => $$('[data-reveal]', main).forEach(el => el.classList.add('in')))));
    main.onclick = async event => {
      const card = event.target.closest('[data-ticket]');
      if (!card) return;
      const id = card.dataset.ticket, t = list.find(x => x.id === id);
      if (event.target.closest('[data-reply]')) {
        const data = await formDialog({ title: 'Reply to ' + t.name, text: t.subject, submit: 'Send reply', fields: [{ name: 'answer', label: 'Reply', type: 'textarea', required: true, min: 3, max: 1800, value: t.answer || '' }] });
        if (!data) return;
        await api('/admin/tickets/' + id, { method: 'PUT', body: { answer: data.answer } }).then(() => { toast('Reply sent', 'success'); return adminPanels.desk(main, status); }).catch(fail);
      } else if (event.target.closest('[data-set]')) {
        await api('/admin/tickets/' + id, { method: 'PUT', body: { status: event.target.closest('[data-set]').dataset.set } }).then(() => adminPanels.desk(main, status)).catch(fail);
      }
    };
  },

  async ai(main) {
    const d = await api('/admin/ai');
    const f = d.feed, tone = f.ageMinutes > 180 ? 'warn' : 'ok';
    main.innerHTML = `<div class="stat-grid stat-grid--4">${statTile('Notices', f.notices, 'bell')}${statTile('Study items', f.study, 'book')}${statTile('AI-assisted', f.aiItems, 'sparkle')}${statTile('Minutes since check', f.ageMinutes, 'clock', tone === 'warn' ? 'tone-warn' : 'tone-ok')}</div>
      <div class="card" data-reveal><div class="admin-head"><div><h2>${icon('sparkle', 18)} Hourly editorial workflow</h2>
        <p class="muted">Source: <code>${esc(d.editorialUrl)}</code></p></div>
        <button class="btn btn--primary btn--sm" type="button" id="refreshFeed">${icon('refresh', 15)}Refresh now</button></div>
        <p><span class="live live--${f.live ? 'ok' : 'warn'}"><i></i>${f.live ? 'Live feed' : 'Saved snapshot in use'}</span> <span class="muted">checked ${esc(timeAgo(Date.parse(f.checkedAt), Date.now()))}</span></p>
        ${f.digest ? `<p class="digest-text">${esc(f.digest.text)}</p>` : ''}
        <p class="muted small">${d.webhookConfigured ? 'Run webhook is configured — each hourly run is logged below.' : 'Set <code>AI_WEBHOOK_SECRET</code> to log each hourly run here (see docs/DEPLOY.md).'}</p></div>
      <div class="card" data-reveal><h2>${icon('list', 18)} Recent runs</h2>${d.runs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Status</th><th>+</th><th>~</th><th>−</th><th>Sources</th><th>Model</th><th>Notes</th></tr></thead><tbody>
        ${d.runs.map(r => `<tr><td>${esc(fmtDateTime(r.started))}</td><td><span class="deadline deadline--${r.status === 'success' ? 'ok' : r.status === 'failed' ? 'hot' : 'soon'}">${esc(r.status)}</span></td><td>${r.added}</td><td>${r.updated}</td><td>${r.removed}</td><td>${r.sources}</td><td class="muted small">${esc(r.model || '—')}</td><td class="muted small">${esc(truncate(r.notes || '', 90))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No runs logged yet.</p>'}</div>`;
    $('#refreshFeed').addEventListener('click', e => busy(e.currentTarget, async () => { const r = await api('/admin/ai/refresh', { method: 'POST', body: {} }); toast(r.live ? 'Feed refreshed' : 'Live feed unreachable — using snapshot', r.live ? 'success' : 'info'); await adminPanels.ai(main); $$('[data-reveal]', main).forEach(el => el.classList.add('in')); }));
  },

  async settings(main) {
    const s = await api('/admin/settings');
    const text = (key, label, extra = '') => `<label>${label}<input name="${key}" value="${esc(s[key] || '')}" ${extra}></label>`;
    main.innerHTML = `<form class="card form" id="settingsForm" data-reveal><h2>${icon('bell', 18)} Announcement banner</h2>
      <label class="check"><input type="checkbox" name="announcement_active"${s.announcement_active === '1' ? ' checked' : ''}> Show banner on every page</label>
      <div class="field-row"><label class="grow">Message<input name="announcement_text" maxlength="240" value="${esc(s.announcement_text)}" placeholder="e.g. HSC admission portal opens tomorrow"></label>
      <label>Style<select name="announcement_level">${['info', 'success', 'warning'].map(l => `<option${s.announcement_level === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${text('announcement_link', 'Link (optional, HTTPS)', 'type="url" maxlength="600"')}
      <h2>${icon('shield', 18)} Site controls</h2>
      <label class="check"><input type="checkbox" name="readonly"${s.readonly === '1' ? ' checked' : ''}> Read-only mode (pause posting, comments, reactions and uploads)</label>
      <label class="check"><input type="checkbox" name="registration_open"${s.registration_open !== '0' ? ' checked' : ''}> Allow new profiles</label>
      <h2>${icon('globe', 18)} Brand &amp; contact</h2>
      ${text('site_tagline', 'Footer tagline', 'maxlength="140"')}${text('contact_email', 'Contact email', 'type="email" maxlength="120"')}
      <div class="field-row">${text('social_facebook', 'Facebook', 'type="url"')}${text('social_telegram', 'Telegram', 'type="url"')}</div><div class="field-row">${text('social_whatsapp', 'WhatsApp', 'type="url"')}${text('social_youtube', 'YouTube', 'type="url"')}</div>
      <div class="form-foot"><span class="muted small">Changes are written to the audit log.</span><button class="btn btn--primary" type="submit">${icon('check', 16)}Save settings</button></div></form>`;
    $('#settingsForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target, data = Object.fromEntries(new FormData(form));
      for (const key of ['announcement_active', 'readonly', 'registration_open']) data[key] = form[key].checked;
      await busy($('button[type="submit"]', form), async () => { const r = await api('/admin/settings', { method: 'PUT', body: data }); toast('Settings saved', 'success'); await loadSession(); renderSession(); });
    });
  },

  async audit(main) {
    let before = 0;
    main.innerHTML = `<div class="card"><h2>${icon('list', 18)} Audit log</h2><div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody id="auditRows"></tbody></table></div><div class="center"><button class="btn btn--ghost" type="button" id="auditMore" hidden>Load more</button></div></div>`;
    const body = $('#auditRows'), more = $('#auditMore');
    const load = async () => {
      const { entries, more: has } = await api('/admin/audit' + (before ? '?before=' + before : ''));
      body.insertAdjacentHTML('beforeend', entries.map(e => `<tr><td class="muted small">${esc(fmtDateTime(e.created))}</td><td>${esc(e.actor_name)}</td><td><code>${esc(e.action)}</code></td><td class="muted small">${esc(truncate(e.detail || e.target || '', 120))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries yet.</td></tr>');
      if (entries.length) before = entries[entries.length - 1].created;
      more.hidden = !has;
    };
    more.addEventListener('click', () => busy(more, load));
    await load();
  },

  async export(main) {
    main.innerHTML = `<div class="card form" data-reveal><h2>${icon('download', 18)} Full data export</h2>
      <p class="muted">Download members, posts, comments, published items, requests, reports and settings as one JSON file for backup or migration. Handle it as confidential — it contains member content.</p>
      <a class="btn btn--primary" href="/api/admin/export" download>${icon('download', 16)}Download JSON export</a></div>`;
  },
};
