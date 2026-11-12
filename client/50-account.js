// ---- Account page (client-rendered): profile, saved, posts, Information Desk, File Desk, data & privacy ----

const fmtSize = bytes => bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';

async function renderAccount(view) {
  const { signedIn, profile } = S.session;
  if (!signedIn) {
    view.innerHTML = `${pageHead('Your space', 'Account', 'Profile, saved posts, Information Desk ও private File Desk এক জায়গায়।')}
      <div class="container narrow"><div class="card cta-card" data-reveal><div class="composer-art">${icon('lock', 32)}</div>
      <h2>Sign in to continue</h2><p class="muted">ChatGPT দিয়ে sign in করুন। আমরা আপনার email ঠিকানা সংরক্ষণ করি না।</p>
      <a class="btn btn--primary btn--lg" href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">Sign in with ChatGPT</a></div></div>`;
    return;
  }
  if (!profile) {
    view.innerHTML = `${pageHead('Welcome', 'Create your profile', 'আপনার নাম ও study goal দিন — তারপর community-তে যোগ দিন।')}
      <div class="container narrow"><form class="card form" data-reveal id="profileForm">${profileFields({})}
      <div class="form-foot"><span class="muted small">Email সংরক্ষণ করা হয় না। যেকোনো সময় বদলানো বা মুছে ফেলা যায়।</span><button class="btn btn--primary" type="submit">${icon('check', 16)}Create profile</button></div></form></div>`;
    $('#profileForm').addEventListener('submit', saveProfile);
    return;
  }
  view.innerHTML = '<div class="container"><div class="skeleton skeleton--block"></div></div>';
  let data;
  try { data = await api('/account'); } catch (error) { fail(error); view.innerHTML = emptyState('Account load করা যায়নি। আবার চেষ্টা করুন।'); return; }
  const ctx = ctxNow();
  const tabs = [['posts', 'My posts', data.posts.length], ['saved', 'Saved', data.saved.length], ['desk', 'Information Desk', data.tickets.length], ['files', 'File Desk'], ['privacy', 'Data & privacy']];
  const mine = S.session.rank >= 1;
  view.innerHTML = `<section class="container account-head" data-reveal>
    <div class="card profile-card">${avatar(profile.name, 'avatar--lg')}
      <div class="grow"><h1 id="heading" tabindex="-1">${esc(profile.name)} ${roleBadge(profile.role)}</h1>
      <p class="muted">${profile.focus ? esc(profile.focus) + ' · ' : ''}Member since ${esc(fmtDate(profile.created))}</p>
      ${profile.goal ? `<p class="goal">${icon('pin', 14)} ${esc(profile.goal)}</p>` : ''}</div>
      <div class="profile-actions">${mine ? `<a class="btn btn--ghost btn--sm" href="/admin" data-link>${icon('sliders', 15)}${S.session.rank >= 2 ? 'Admin console' : 'Moderation'}</a>` : ''}
      <button class="btn btn--ghost btn--sm" type="button" data-tab-go="profile">${icon('edit', 15)}Edit profile</button></div></div></section>
    <section class="container"><div class="tabs" role="tablist">${tabs.map(([key, label, n], i) =>
      `<button class="tab" role="tab" type="button" data-tab="${key}" aria-selected="${i === 0}">${label}${n !== undefined ? `<b>${n}</b>` : ''}</button>`).join('')}<button class="tab" role="tab" type="button" data-tab="profile" hidden>Profile</button></div>
      <div id="tabPanel" class="tab-panel" role="tabpanel"></div></section>`;
  const panel = $('#tabPanel');
  const panels = {
    posts: () => `<div class="stack">${data.posts.length ? data.posts.map(p => postCard(p, ctx)).join('') : emptyState('আপনি এখনো কোনো পোস্ট করেননি।', '<a class="btn btn--primary btn--sm" href="/community" data-link>Community-তে যান</a>')}</div>`,
    saved: () => `<div class="stack">${data.saved.length ? data.saved.map(p => postCard(p, ctx)).join('') : emptyState('কোনো পোস্ট save করা নেই। পোস্টের নিচে “Save” ক্লিক করুন।')}</div>`,
    desk: () => `<div class="layout layout--even"><form class="card form" id="ticketForm"><h2>${icon('mail', 18)} নতুন request</h2>
        <label>Subject<input name="subject" required minlength="3" maxlength="120" placeholder="কী বিষয়ে জানতে চান?"></label>
        <label>Details<textarea name="body" required minlength="3" maxlength="1800" placeholder="বিস্তারিত লিখুন…"></textarea></label>
        <div class="form-foot"><span class="muted small">Admin উত্তর দিলে এখানেই দেখতে পাবেন।</span><button class="btn btn--primary" type="submit">${icon('send', 16)}Send</button></div></form>
      <div class="stack">${data.tickets.length ? data.tickets.map(ticketCard).join('') : emptyState('এখনো কোনো request পাঠাননি।')}</div></div>`,
    files: () => `<div class="card form"><h2>${icon('lock', 18)} Private File Desk</h2>
        <p class="muted">PDF, PNG বা JPEG (সর্বোচ্চ ৫ MB, ১২টি ফাইল)। শুধু আপনিই দেখতে পাবেন।</p>
        <label class="dropzone" id="dropzone">${icon('upload', 26)}<span>ফাইল বেছে নিন বা এখানে ছেড়ে দিন</span><input type="file" id="fileInput" accept="application/pdf,image/png,image/jpeg" hidden></label>
        <div id="fileList" class="file-list"><div class="skeleton skeleton--line"></div></div></div>`,
    profile: () => `<form class="card form" id="profileForm">${profileFields(profile)}<div class="form-foot"><span></span><button class="btn btn--primary" type="submit">${icon('check', 16)}Save changes</button></div></form>`,
    privacy: () => `<div class="layout layout--even"><div class="card form"><h2>${icon('download', 18)} আপনার ডেটা</h2>
        <p class="muted">প্রোফাইল, পোস্ট, মন্তব্য, reaction, bookmark, request ও ফাইলের তালিকা JSON আকারে নামিয়ে নিন।</p>
        <a class="btn btn--ghost" href="/api/account/export" download>${icon('download', 16)}Export my data</a></div>
      <div class="card form danger-zone"><h2>${icon('trash', 18)} Account মুছে ফেলুন</h2>
        <p class="muted">আপনার profile, পোস্ট, মন্তব্য, request ও ফাইল স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যায় না।</p>
        <button class="btn btn--danger" type="button" id="deleteAccount">${icon('trash', 16)}Delete my account</button></div></div>`,
  };
  const show = async key => {
    $$('.tab', view).forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === key)));
    panel.innerHTML = panels[key]();
    $$('[data-reveal]', panel).forEach(el => el.classList.add('in'));
    if (key === 'desk') $('#ticketForm').addEventListener('submit', sendTicket);
    if (key === 'files') bindFiles();
    if (key === 'profile') $('#profileForm').addEventListener('submit', saveProfile);
    if (key === 'privacy') $('#deleteAccount').addEventListener('click', deleteAccount);
    initTilt();
  };
  view.onclick = event => {
    const tab = event.target.closest('[data-tab]');
    const go = event.target.closest('[data-tab-go]');
    if (tab) show(tab.dataset.tab); else if (go) show(go.dataset.tabGo);
  };
  show(new URLSearchParams(location.search).get('tab') && panels[new URLSearchParams(location.search).get('tab')] ? new URLSearchParams(location.search).get('tab') : 'posts');
}

function profileFields(p) {
  return `<h2>${icon('user', 18)} Profile</h2>
    <label>Display name<input name="name" required minlength="2" maxlength="55" value="${esc(p.name || '')}" placeholder="আপনার নাম"></label>
    <div class="field-row"><label class="grow">Study focus<input name="focus" maxlength="80" value="${esc(p.focus || '')}" placeholder="যেমন: Medical, Engineering, HSC"></label></div>
    <label>Goal<textarea name="goal" maxlength="500" placeholder="আপনার লক্ষ্য…">${esc(p.goal || '')}</textarea></label>`;
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.target, data = Object.fromEntries(new FormData(form));
  await busy($('button[type="submit"]', form), async () => {
    await api('/profile', { method: 'PUT', body: data });
    await loadSession();
    toast('Profile saved', 'success');
    renderSession();
    renderRoute();
  });
}

function ticketCard(t) {
  const tone = t.status === 'answered' ? 'ok' : t.status === 'closed' ? 'past' : 'soon';
  return `<article class="card ticket"><div class="notice-top"><span class="deadline deadline--${tone}">${esc(t.status)}</span><span class="muted small">${esc(fmtDateTime(t.created))}</span></div>
    <h3>${esc(t.subject)}</h3><p>${esc(t.body)}</p>
    ${t.answer ? `<div class="answer">${icon('shield', 16)}<div><strong>Admin reply</strong><p>${esc(t.answer)}</p></div></div>` : ''}</article>`;
}

async function sendTicket(event) {
  event.preventDefault();
  const form = event.target, data = Object.fromEntries(new FormData(form));
  await busy($('button[type="submit"]', form), async () => {
    await api('/tickets', { method: 'POST', body: data });
    toast('Request sent. We will reply here.', 'success');
    renderRoute();
  });
}

async function bindFiles() {
  const list = $('#fileList'), input = $('#fileInput'), zone = $('#dropzone');
  const load = async () => {
    try {
      const files = await api('/files');
      list.innerHTML = files.length ? files.map(f => `<div class="file"><span class="file-ico">${icon('file', 20)}</span><div class="grow"><strong>${esc(f.name)}</strong><span class="muted small">${fmtSize(f.size)} · ${esc(fmtDate(Date.parse(f.uploaded)))}</span></div>
        <a class="btn btn--ghost btn--sm" href="/api/files/${esc(f.id)}" download>${icon('download', 15)}</a>
        <button class="btn btn--ghost btn--sm act--danger" type="button" data-del="${esc(f.id)}" aria-label="Delete file">${icon('trash', 15)}</button></div>`).join('') : '<p class="muted">কোনো ফাইল নেই।</p>';
    } catch (error) { list.innerHTML = ''; fail(error); }
  };
  const upload = async file => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('ফাইল ৫ MB-এর বেশি।', 'error');
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return toast('PDF, PNG বা JPEG দিন।', 'error');
    zone.classList.add('is-busy');
    try { await api('/files', { method: 'POST', raw: true, body: file, headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) } }); toast('Uploaded', 'success'); await load(); }
    catch (error) { fail(error); }
    finally { zone.classList.remove('is-busy'); input.value = ''; }
  };
  input.addEventListener('change', () => upload(input.files[0]));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); upload(e.dataTransfer.files[0]); });
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.tabIndex = 0;
  list.addEventListener('click', async event => {
    const btn = event.target.closest('[data-del]');
    if (!btn || !(await confirmDialog('Delete this file?', 'It will be removed permanently.', 'Delete', true))) return;
    await busy(btn, async () => { await api('/files/' + btn.dataset.del, { method: 'DELETE' }); await load(); });
  });
  load();
}

async function deleteAccount() {
  const data = await formDialog({ title: 'Delete your account?', text: 'This permanently removes your profile, posts, comments, requests and files. Type DELETE to confirm.', danger: true, submit: 'Delete forever',
    fields: [{ name: 'confirm', label: 'Type DELETE', required: true, placeholder: 'DELETE' }] });
  if (!data) return;
  try { await api('/account', { method: 'DELETE', body: { confirm: data.confirm } }); toast('Your account was deleted.', 'success'); await loadSession(); renderSession(); navigate('/'); }
  catch (error) { fail(error); }
}
