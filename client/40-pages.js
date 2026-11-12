// ---- Page behaviour: filters, search, timer, community actions, comments ----

function needProfile() {
  if (S.session.profile) return true;
  if (!S.session.signedIn) toast('Sign in with ChatGPT to do that.', 'info');
  else { toast('Create your profile first.', 'info'); navigate('/account'); }
  return false;
}

const postId = card => card?.dataset.post;
const onPostPage = () => /^\/post\//.test(S.path);

async function refreshPost(card, keepComments = true) {
  const id = postId(card);
  const open = keepComments && card.querySelector('.comments:not([hidden])');
  const post = await api('/posts/' + id);
  const holder = document.createElement('div');
  holder.innerHTML = postCard(post, ctxNow(), { full: onPostPage() });
  const fresh = holder.firstElementChild;
  fresh.classList.add('in');
  card.replaceWith(fresh);
  if (open && !onPostPage()) { fresh.querySelector('[data-act="comments"]').setAttribute('aria-expanded', 'true'); await loadComments(fresh); }
  else if (onPostPage()) await loadComments(fresh);
  return fresh;
}

function commentHtml(c, rank) {
  return `<div class="comment" data-comment="${esc(c.id)}">${avatar(c.name, 'avatar--sm')}<div class="comment-main">
    <div><strong>${esc(c.name)}</strong> ${roleBadge(c.authorRole)} <span class="muted small">${esc(timeAgo(c.created, Date.now()))}</span></div>
    <p>${linkify(c.body)}</p></div>
    <div class="comment-actions">${S.session.signedIn && !c.mine ? `<button class="act" type="button" data-act="report-comment" aria-label="Report comment">${icon('flag', 14)}</button>` : ''}
    ${c.mine || rank >= 1 ? `<button class="act act--danger" type="button" data-act="delete-comment" aria-label="Delete comment">${icon('trash', 14)}</button>` : ''}</div></div>`;
}

async function loadComments(card) {
  const box = $('.comments', card);
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '<div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line"></div>';
  try {
    const list = await api(`/posts/${postId(card)}/comments`);
    const form = S.session.profile
      ? `<form class="comment-form" data-form="comment"><input name="body" maxlength="1000" required placeholder="একটি মন্তব্য লিখুন…" aria-label="Write a comment"><button class="btn btn--primary btn--sm" type="submit">${icon('send', 15)}Send</button></form>`
      : `<p class="muted small">${S.session.signedIn ? 'Create a profile from Account to comment.' : 'Sign in to join the conversation.'}</p>`;
    box.innerHTML = form + `<div class="comment-list">${list.length ? list.map(c => commentHtml(c, S.session.rank)).join('') : '<p class="muted small">এখনো কোনো মন্তব্য নেই।</p>'}</div>`;
  } catch (error) { box.innerHTML = ''; fail(error); }
}

// ---------- delegated actions ----------
const actions = {
  palette: () => openPalette(),
  theme: () => cycleTheme(),
  install: () => installApp(),
  share: el => shareItem(el.dataset.title, el.dataset.url),
  'share-to': el => shareTo(el.dataset.net, el.dataset.title, el.dataset.url),
  'copy-link': async el => toast((await copyText(absoluteUrl(el.dataset.url))) ? 'Link copied' : 'Could not copy the link', 'success', 1800),

  async reaction(el) {
    if (!needProfile()) return;
    const card = el.closest('[data-post]');
    const kind = el.getAttribute('aria-pressed') === 'true' ? null : el.dataset.kind;
    await busy(el, async () => { await api(`/posts/${postId(card)}/reaction`, { method: 'PUT', body: { kind } }); await refreshPost(card); });
  },
  async comments(el) {
    const card = el.closest('[data-post]');
    const open = el.getAttribute('aria-expanded') === 'true';
    if (open && !onPostPage()) { el.setAttribute('aria-expanded', 'false'); $('.comments', card).hidden = true; return; }
    el.setAttribute('aria-expanded', 'true');
    await loadComments(card);
  },
  async bookmark(el) {
    const card = el.closest('[data-post]');
    const saved = el.getAttribute('aria-pressed') !== 'true';
    await busy(el, async () => { await api(`/posts/${postId(card)}/bookmark`, { method: 'PUT', body: { saved } }); await refreshPost(card); toast(saved ? 'Saved to your account' : 'Removed from saved', 'success', 1800); });
  },
  async 'pin-post'(el) {
    const card = el.closest('[data-post]');
    const pinned = el.getAttribute('aria-pressed') !== 'true';
    await busy(el, async () => { await api(`/posts/${postId(card)}/pin`, { method: 'PUT', body: { pinned } }); await refreshPost(card); toast(pinned ? 'Post pinned' : 'Post unpinned', 'success', 1800); });
  },
  async 'delete-post'(el) {
    const card = el.closest('[data-post]');
    if (!(await confirmDialog('Delete this post?', 'This also removes its comments and reactions. This cannot be undone.', 'Delete', true))) return;
    await busy(el, async () => {
      await api('/posts/' + postId(card), { method: 'DELETE' });
      toast('Post deleted', 'success', 1800);
      if (onPostPage()) navigate('/community'); else card.remove();
    });
  },
  async 'report-post'(el) {
    const card = el.closest('[data-post]');
    await reportDialog(postId(card), '');
  },
  async 'report-comment'(el) {
    const card = el.closest('[data-post]');
    await reportDialog(postId(card), el.closest('[data-comment]').dataset.comment);
  },
  async 'delete-comment'(el) {
    const card = el.closest('[data-post]'), row = el.closest('[data-comment]');
    if (!(await confirmDialog('Delete this comment?', '', 'Delete', true))) return;
    await busy(el, async () => { await api(`/posts/${postId(card)}/comments/${row.dataset.comment}`, { method: 'DELETE' }); await refreshPost(card); });
  },
  async more(el) {
    const posts = $('#posts');
    const last = $$('[data-post]', posts).filter(card => !card.classList.contains('post--pinned')).pop();
    const before = last ? Number(last.dataset.created) : 0;
    await busy(el, async () => {
      const topic = $('.chip-btn[data-topic][aria-pressed="true"]')?.dataset.topic || '';
      const list = await api(`/feed?before=${before}${topic ? '&topic=' + encodeURIComponent(topic) : ''}`);
      appendPosts(list);
      el.hidden = list.length < 25;
    });
  },
};

async function reportDialog(post, commentId) {
  if (!S.session.profile) return needProfile();
  const data = await formDialog({
    title: commentId ? 'Report comment' : 'Report post', text: 'Moderators will review it. Please only report content that breaks the community guidelines.',
    fields: [{ name: 'reason', label: 'Reason', type: 'select', options: [{ value: 'spam', label: 'Spam' }, { value: 'abuse', label: 'Abusive or harassing' }, { value: 'misleading', label: 'Misleading information' }, { value: 'other', label: 'Something else' }] },
      { name: 'detail', label: 'Details (optional)', type: 'textarea', max: 300 }], submit: 'Send report',
  });
  if (!data) return;
  try {
    const result = await api(`/posts/${post}/report`, { method: 'POST', body: { reason: data.reason, detail: data.detail || '', commentId: commentId || undefined } });
    toast(result.duplicate ? 'You already reported this.' : 'Thanks — a moderator will take a look.', 'success');
  } catch (error) { fail(error); }
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-act]');
  if (!el || el.closest('dialog.palette')) return;
  const handler = actions[el.dataset.act];
  if (!handler) return;
  if (el.tagName === 'A') event.preventDefault();
  Promise.resolve(handler(el, event)).catch(fail);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const button = $('button[type="submit"]', form);
  if (form.dataset.form === 'comment') {
    if (!needProfile()) return;
    const card = form.closest('[data-post]');
    busy(button, async () => {
      await api(`/posts/${postId(card)}/comments`, { method: 'POST', body: { body: new FormData(form).get('body') } });
      await refreshPost(card);
    });
  } else if (form.dataset.form === 'post') {
    const data = Object.fromEntries(new FormData(form));
    busy(button, async () => {
      await api('/feed', { method: 'POST', body: data });
      form.reset();
      toast('Post published', 'success');
      await reloadFeed();
    });
  }
});

function appendPosts(list) {
  const holder = document.createElement('div');
  holder.innerHTML = list.map(post => postCard(post, ctxNow())).join('');
  [...holder.children].forEach(el => { el.classList.add('in'); $('#posts').appendChild(el); });
}

async function reloadFeed() {
  const topic = $('.chip-btn[data-topic][aria-pressed="true"]')?.dataset.topic || '';
  const list = await api('/feed' + (topic ? '?topic=' + encodeURIComponent(topic) : ''));
  const box = $('#posts');
  box.innerHTML = list.length ? list.map(post => postCard(post, ctxNow())).join('') : emptyState('এই topic-এ এখনো কোনো পোস্ট নেই। প্রথম পোস্টটি আপনিই করুন!');
  $$('[data-reveal]', box).forEach(el => el.classList.add('in'));
  const more = $('[data-act="more"]');
  if (more) more.hidden = list.length < 25;
}

// ---------- page enhancers ----------
function filterGrid(grid, empty) {
  const search = $('#noticeSearch');
  const active = $('.chip-btn[data-filter][aria-pressed="true"]')?.dataset.filter || '';
  const needle = (search?.value || '').trim().toLowerCase();
  let shown = 0;
  $$('.card', grid).forEach(card => {
    const match = (!active || card.dataset.category === active) && (!needle || card.textContent.toLowerCase().includes(needle));
    card.hidden = !match;
    if (match) { shown++; card.classList.add('in'); }
  });
  if (empty) empty.hidden = shown > 0 || !$$('.card', grid).length;
}

function enhanceFilters() {
  const grid = $('#noticeGrid') || $('#studyGrid');
  if (!grid) return;
  const empty = $('#noticeEmpty');
  const search = $('#noticeSearch');
  const q = new URLSearchParams(location.search).get('q');
  if (search && q) search.value = q;
  search?.addEventListener('input', debounce(() => filterGrid(grid, empty), 120));
  $$('.chip-btn[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    $$('.chip-btn[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    filterGrid(grid, empty);
  }));
  if (q) filterGrid(grid, empty);
}

function enhanceCommunity() {
  const box = $('#posts');
  if (!box) return;
  $$('.chip-btn[data-topic]').forEach(btn => btn.addEventListener('click', () => {
    $$('.chip-btn[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    reloadFeed().catch(fail);
  }));
}

// ---------- focus timer ----------
let timerState = null;
function enhanceTimer() {
  const root = $('[data-timer]');
  if (!root) return;
  const display = $('[data-timer-display]', root), bar = $('[data-timer-bar]', root), label = $('[data-timer-mode]', root), toggle = $('[data-act="timer-toggle"]', root);
  timerState = { mode: 'Focus', total: 25 * 60, left: 25 * 60, running: false, id: 0, end: 0 };
  const paint = () => {
    const m = String(Math.floor(timerState.left / 60)).padStart(2, '0'), s = String(timerState.left % 60).padStart(2, '0');
    display.textContent = `${m}:${s}`; label.textContent = timerState.mode;
    bar.style.transform = `scaleX(${1 - timerState.left / timerState.total})`;
    toggle.innerHTML = `${icon(timerState.running ? 'pause' : 'play', 14)} ${timerState.running ? 'Pause' : 'Start'}`;
    document.title = timerState.running ? `${display.textContent} · ${timerState.mode}` : document.title.replace(/^\d\d:\d\d · \w+ — /, '');
  };
  const stop = () => { clearInterval(timerState.id); timerState.running = false; };
  const tick = () => {
    timerState.left = Math.max(0, Math.round((timerState.end - Date.now()) / 1000));
    if (timerState.left === 0) {
      stop(); toast(timerState.mode === 'Focus' ? 'Focus session done — take a break!' : 'Break over — back to it!', 'success', 6000);
      if (navigator.vibrate) navigator.vibrate(200);
    }
    paint();
  };
  const handlers = {
    'timer-toggle'() {
      if (timerState.running) { stop(); return paint(); }
      if (timerState.left === 0) timerState.left = timerState.total;
      timerState.end = Date.now() + timerState.left * 1000; timerState.running = true;
      timerState.id = setInterval(tick, 500); paint();
    },
    'timer-reset'() { stop(); timerState.left = timerState.total; paint(); },
    'timer-mode'() {
      stop(); const focus = timerState.mode !== 'Focus';
      timerState.mode = focus ? 'Focus' : 'Break'; timerState.total = timerState.left = (focus ? 25 : 5) * 60; paint();
    },
  };
  Object.assign(actions, handlers);
  paint();
}

function enhancePage() {
  enhanceFilters(); enhanceCommunity(); enhanceTimer();
  const post = $('[data-post]');
  if (post && onPostPage()) { post.dataset.created = post.dataset.created || ''; loadComments(post); }
}
