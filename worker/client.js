const $ = selector => document.querySelector(selector);
const view = $('#view');
const noticeTypes = ['Admission', 'Exam', 'Holiday', 'Official', 'Breaking'];
const studyTypes = ['Trend', 'Tip', 'Video', 'Website'];
const topics = ['Admission', 'Study', 'Question', 'General'];
const pages = {
  home: ['Student community', 'Academic Admission', 'প্রশ্ন করুন, অভিজ্ঞতা শেয়ার করুন এবং অন্য শিক্ষার্থীদের কাছ থেকে শিখুন।'],
  notice: ['Bangladesh education', 'Notice Board', 'ভর্তি, পরীক্ষা, ছুটি ও শিক্ষা-সংক্রান্ত জরুরি খবর মূল উৎসসহ দেখুন।'],
  study: ['Learning resources', 'Study & Guidelines', 'Study tips, educational videos, দরকারি websites এবং গত ৭ দিনের আলোচিত পোস্ট।'],
  account: ['Your workspace', 'Account', 'Profile, saved posts, Information Desk ও private File Desk এক জায়গায়।'],
  admin: ['Site administration', 'Admin', 'Notices ও study resources প্রকাশ করুন এবং Information Desk-এর উত্তর দিন।'],
};
let session = { signedIn: false, profile: null, admin: false };
let current = '';
let sequence = 0;
let topic = '';
let filters = { notice: '', study: '' };
let latestItems = {};
let feedBefore;
let returnTo = '/#account';
const dhakaDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium' });
const dhakaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const options = (values, selected) => values.map(value => `<option ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
const signin = () => `<a class="button primary" href="/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}" target="_top">Sign in with ChatGPT</a>`;
const signup = () => '<a class="button primary" href="#account">Create profile</a>';
const empty = message => `<p class="empty muted">${esc(message)}</p>`;
const link = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const postLink = (id, title) => `<a href="#post/${esc(id)}">${esc(title)}</a>`;

function flash(text, error = false) {
  const node = $('#flash');
  node.className = error ? 'error' : '';
  node.textContent = text;
  node.hidden = !text;
}

async function api(path, method = 'GET', body) {
  const upload = body instanceof File;
  const headers = upload ? {'Content-Type':body.type, 'X-File-Name':encodeURIComponent(body.name)} :
    body === undefined ? {} : {'Content-Type':'application/json'};
  const response = await fetch('/api' + path, { method, headers, body:upload ? body : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

function updateSession() {
  $('#session').innerHTML = session.signedIn ?
    `<strong>${esc(session.profile?.name || 'Signed in')}</strong><br><a href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a>` :
    '<a href="#account">Sign in / Register</a>';
  $('#adminNav').hidden = !session.admin;
}

function title(page) {
  const [label, heading, intro] = pages[page];
  $('#heroLabel').textContent = label;
  $('#heading').textContent = heading;
  $('#intro').textContent = intro;
  document.querySelectorAll('#nav a').forEach(anchor => {
    if (anchor.hash === '#' + page) anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  });
}

function miniPosts(posts, fallback) {
  return posts.length ? posts.map(post => `<div class="comment">${postLink(post.id,post.title)}
    <p class="muted">${esc(post.topic)} · ${post.comments} comments · ${post.likes + post.helpful} reactions</p></div>`).join('') :
    `<p class="muted">${esc(fallback)}</p>`;
}

function card(post) {
  const canWrite = Boolean(session.profile);
  const react = (kind, label, count) => `<button data-act="reaction" data-kind="${kind}" data-active="${post.myReaction === kind}" aria-pressed="${post.myReaction === kind}">${label} <span>${count}</span></button>`;
  return `<article class="card stack post" data-post="${esc(post.id)}">
    <div class="meta"><span class="pill">${esc(post.topic)}</span><span class="muted">${esc(post.name)} · ${dhakaTime.format(post.created)}</span></div>
    <h2>${postLink(post.id, post.title)}</h2><p class="body">${esc(post.body)}</p>
    <div class="actions">
      ${react('like','Like',post.likes)}${react('helpful','Helpful',post.helpful)}
      <button data-act="comments" aria-expanded="false">Comments ${post.comments}</button>
      <button data-act="share">Share</button>
      ${canWrite ? `<button data-act="bookmark" aria-pressed="${Boolean(post.saved)}">${post.saved ? 'Saved' : 'Save'}</button>` : ''}
      ${post.mine || session.admin ? '<button data-act="delete-post" class="danger">Delete</button>' : ''}
    </div>
    <div class="comments stack" hidden></div></article>`;
}

function postForm() {
  return session.profile ? `<form data-form="post" class="panel">
    <h2>New post</h2><label>Topic<select name="topic">${options(topics)}</select></label>
    <label>Title<input name="title" minlength="3" maxlength="120" required></label>
    <label>Post<textarea name="body" minlength="3" maxlength="4000" required></textarea></label>
    <button class="primary">Publish post</button></form>` :
    `<div class="panel stack"><h2>Join the discussion</h2><p class="muted">Post, comment, react ও save করতে একটি profile তৈরি করুন।</p>
      <div>${session.signedIn ? signup() : signin()}</div></div>`;
}

async function showHome(run) {
  const [posts, notices] = await Promise.all([api('/feed?topic=' + encodeURIComponent(topic)), api('/notice')]);
  if (run !== sequence) return;
  feedBefore = posts.length === 25 ? posts.at(-1).created : null;
  view.innerHTML = `<div class="columns"><section class="stack">
    ${postForm()}<div class="toolbar"><h2>Community feed</h2>
    <select id="topic" aria-label="Filter posts"><option value="">All topics</option>${options(topics, topic)}</select></div>
    <div id="posts" class="stack">${posts.length ? posts.map(card).join('') : empty('এই topic-এ এখনো কোনো পোস্ট নেই।')}</div>
    <div><button data-act="more" ${feedBefore ? '' : 'hidden'}>Load older posts</button></div>
    </section><aside class="panel stack"><h2>Recent notices</h2>
    ${notices.items.slice(0,4).map(item => `<div><span class="pill">${esc(item.category)}</span><p>${esc(item.title)}</p></div>`).join('') || '<p class="muted">No notices yet.</p>'}
    <a href="#notice">View Notice Board →</a></aside></div>`;
}

function resourceCards(section) {
  const items = latestItems[section]?.items || [];
  const visible = items.filter(item => !filters[section] || item.category === filters[section]);
  return visible.length ? visible.map(item => `<article class="card stack">
      <div class="meta"><span class="pill">${esc(item.category)}</span><span class="muted">${dhakaDate.format(item.created)} · ${esc(item.source)} · ${esc(item.origin)}</span></div>
      <h2>${esc(item.title)}</h2><p class="body">${esc(item.summary)}</p>
      ${item.url ? `<div>${link(item.url, section === 'notice' ? 'Open source' : 'Open resource')}</div>` : ''}
      ${session.admin && item.origin === 'Admin' ? `<div><button data-act="delete-resource" data-id="${esc(item.id)}" class="danger">Delete</button></div>` : ''}
    </article>`).join('') : empty('এই category-তে এখনো কিছু প্রকাশিত হয়নি।');
}

async function showEditorial(section, run) {
  const [data, top] = await Promise.all([api('/' + section), section === 'study' ? api('/top') : []]);
  if (run !== sequence) return;
  latestItems[section] = data;
  const categoryList = section === 'notice' ? noticeTypes : studyTypes;
  view.innerHTML = `<section class="stack">
    ${section === 'study' ? `<div class="panel stack"><h2>Top posts · 7 days</h2>
      <p class="muted">Comments ও reactions-এর মোট সংখ্যা অনুযায়ী।</p>${miniPosts(top,'গত ৭ দিনে কোনো পোস্ট নেই।')}</div>` : ''}
    <div class="toolbar"><p class="muted">${data.live ? 'Editorial check' : 'Saved editorial snapshot'} · ${dhakaTime.format(new Date(data.checkedAt))} (Dhaka)</p>
    <select id="resourceFilter" aria-label="Filter category"><option value="">All categories</option>${options(categoryList,filters[section])}</select></div>
    <div class="resource-grid" id="resources">${resourceCards(section)}</div></section>`;
}

function profileForm(profile) {
  return `<form class="panel" data-form="profile">
    <h2>${profile ? 'Profile & study goal' : 'Register your profile'}</h2>
    <label>Display name <span class="muted">Visible on your public posts and comments</span>
      <input name="name" value="${esc(profile?.name)}" minlength="2" maxlength="55" required></label>
    <label>Study focus<input name="focus" value="${esc(profile?.focus)}" maxlength="80" placeholder="e.g. University admission"></label>
    <label>Study goal<textarea name="goal" maxlength="500">${esc(profile?.goal)}</textarea></label>
    <button class="primary">${profile ? 'Save profile' : 'Create profile'}</button>
  </form>`;
}

function ticketCard(ticket, admin = false) {
  return `<article class="comment stack"><h3>${esc(ticket.subject)}</h3>
    <p class="muted">${admin ? esc(ticket.name) + ' · ' : ''}${dhakaTime.format(ticket.created)}</p>
    <p class="body">${esc(ticket.body)}</p>
    ${ticket.answer ? `<p class="body"><strong>Reply:</strong> ${esc(ticket.answer)}</p>` : '<p class="muted">Awaiting reply</p>'}
    ${admin ? `<form data-form="answer" data-id="${esc(ticket.id)}"><label>Admin reply<textarea name="answer" minlength="3" maxlength="1800" required>${esc(ticket.answer)}</textarea></label><button class="primary">Save reply</button></form>` : ''}</article>`;
}

async function showAccount(run) {
  if (!session.signedIn) {
    view.innerHTML = `<div class="panel stack"><h2>Sign in or register</h2>
      <p>আপনার ChatGPT account দিয়ে sign in করে এখানে profile তৈরি করুন।</p><div>${signin()}</div></div>`;
    return;
  }
  if (!session.profile) { view.innerHTML = profileForm(null); return; }
  const [account, files] = await Promise.all([api('/account'), api('/files')]);
  if (run !== sequence) return;
  view.innerHTML = `<div class="columns">
    <section class="stack">
      <div class="panel stack"><h2>${esc(session.profile.name)}’s dashboard</h2>
      <p>${esc(session.profile.focus || 'Add your study focus in Profile.')}</p>
      ${session.profile.goal ? `<p class="body">${esc(session.profile.goal)}</p>` : ''}
      ${session.admin ? '<p><a href="/private/admission-tracker">Open original private admission tracker →</a></p>' : ''}</div>
      <div class="panel stack"><h2>Saved posts</h2>${miniPosts(account.saved,'Saved posts will appear here.')}</div>
      <div class="panel stack"><h2>My posts</h2>${miniPosts(account.posts,'Your published posts will appear here.')}</div>
      <div class="panel stack"><h2>Information Desk</h2><p class="muted">আপনার request ও reply শুধু আপনি এবং admin দেখতে পারবেন।</p>
        <form data-form="ticket"><label>Subject<input name="subject" minlength="3" maxlength="120" required></label>
        <label>Question<textarea name="body" minlength="3" maxlength="1800" required></textarea></label>
        <button class="primary">Send request</button></form>
        ${account.tickets.map(ticket => ticketCard(ticket)).join('')}</div>
    </section>
    <aside class="stack">${profileForm(session.profile)}
      <div class="panel stack"><h2>Private File Desk</h2><p class="muted">PDF, PNG, JPEG · 5 MB per file · ${files.length}/12 files</p>
        <form data-form="upload"><label>File<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required></label>
        <button class="primary">Upload</button></form>
        ${files.map(file => `<div class="comment"><a href="/api/files/${esc(file.id)}">${esc(file.name)}</a>
          <p class="muted">${Math.ceil(file.size/1024)} KB · ${dhakaDate.format(new Date(file.uploaded))}</p>
          <button data-act="delete-file" data-id="${esc(file.id)}" class="danger">Delete file</button></div>`).join('')}
      </div>
    </aside></div>`;
}

async function showAdmin(run) {
  if (!session.admin) { view.innerHTML = empty('Admin access required.'); return; }
  const tickets = await api('/admin/tickets');
  if (run !== sequence) return;
  view.innerHTML = `<div class="columns"><form class="panel" data-form="resource">
    <h2>Publish notice or study resource</h2>
    <label>Section<select name="section" id="adminSection"><option value="notice">Notice Board</option><option value="study">Study &amp; Guidelines</option></select></label>
    <label>Category<select name="category" id="adminCategory">${options(noticeTypes)}</select></label>
    <label>Title<input name="title" minlength="3" maxlength="160" required></label>
    <label>Summary<textarea name="summary" minlength="3" maxlength="800" required></textarea></label>
    <label>Source or resource link<input name="url" id="resourceUrl" type="url" maxlength="600" placeholder="https://" required></label>
    <button class="primary">Publish</button></form>
    <div class="panel stack"><h2>Information Desk inbox</h2>
    ${tickets.map(ticket => ticketCard(ticket, true)).join('') || '<p class="muted">No requests yet.</p>'}</div></div>`;
}

async function render({ loading = true } = {}) {
  const run = ++sequence;
  const route = location.hash.slice(1);
  const post = /^post\/([a-f0-9-]{36})$/.exec(route);
  current = Object.hasOwn(pages,route) ? route : 'home';
  returnTo = '/#' + (post ? route : current === 'home' ? 'account' : current);
  title(current);
  view.setAttribute('aria-busy', 'true');
  if (loading) view.innerHTML = empty('Loading…');
  try {
    if (post) {
      const record = await api('/posts/' + post[1]);
      if (run !== sequence) return;
      view.innerHTML = card(record);
      await showComments(view.querySelector('.post'));
    } else if (current === 'home') await showHome(run);
    else if (current === 'account') await showAccount(run);
    else if (current === 'admin') await showAdmin(run);
    else await showEditorial(current, run);
  } catch (error) {
    if (run === sequence) view.innerHTML = `${empty(error.message)}<p class="actions"><button data-act="retry">Retry</button></p>`;
  } finally {
    if (run === sequence) view.setAttribute('aria-busy', 'false');
  }
}

async function showComments(cardNode) {
  const area = cardNode.querySelector('.comments');
  const comments = await api('/posts/' + cardNode.dataset.post + '/comments');
  area.innerHTML = comments.map(comment => `<div class="comment stack">
    <p class="muted"><strong>${esc(comment.name)}</strong> · ${dhakaTime.format(comment.created)}</p>
    <p class="body">${esc(comment.body)}</p>
    ${comment.mine || session.admin ? `<div><button class="danger" data-act="delete-comment" data-id="${esc(comment.id)}">Delete comment</button></div>` : ''}</div>`).join('') ||
    '<p class="muted">No comments yet.</p>';
  area.insertAdjacentHTML('beforeend', session.profile ? `<form data-form="comment"><label>Comment<textarea name="body" maxlength="1000" required></textarea></label>
    <button class="primary">Post comment</button></form>` : `<div>${session.signedIn ? signup() : signin()}</div>`);
  area.hidden = false;
  const toggle = cardNode.querySelector('[data-act=comments]');
  toggle.setAttribute('aria-expanded','true');
  if (comments.length < 100) toggle.textContent = 'Comments ' + comments.length;
}

async function refreshCard(node) {
  const wasOpen = !node.querySelector('.comments').hidden;
  const post = await api('/posts/' + node.dataset.post);
  if (!node.isConnected) return;
  const temp = document.createElement('template');
  temp.innerHTML = card(post);
  const updated = temp.content.firstElementChild;
  const currentActions = node.querySelector('.actions');
  currentActions.replaceWith(updated.querySelector('.actions'));
  if (wasOpen) {
    node.querySelector('[data-act=comments]').setAttribute('aria-expanded','true');
  }
}

function signedUp() {
  if (session.profile) return true;
  flash(session.signedIn ? 'Create a profile from Account first.' : 'Sign in from Account to continue.', true);
  return false;
}

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const kind = form.dataset.form;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    let message = 'Saved.';
    if (kind === 'post') {
      await api('/feed','POST',data);
      topic = data.topic;
      message = 'Post published.';
    } else if (kind === 'profile') {
      await api('/profile','PUT',data);
      session = await api('/session');
      updateSession();
      message = 'Profile saved.';
    } else if (kind === 'comment') {
      const node = form.closest('.post');
      await api('/posts/' + node.dataset.post + '/comments','POST',data);
      await showComments(node);
      flash('Comment published.');
      return;
    } else if (kind === 'ticket') {
      await api('/tickets','POST',data);
      message = 'Request sent to the Information Desk.';
    } else if (kind === 'answer') {
      await api('/admin/tickets/' + form.dataset.id,'PUT',data);
      message = 'Reply saved.';
    } else if (kind === 'upload') {
      if (data.file.size > 5 * 1024 * 1024) throw new Error('Choose a file up to 5 MB.');
      await api('/files','POST',data.file);
      message = 'File uploaded.';
    } else if (kind === 'resource') {
      await api('/admin/resources','POST',data);
      message = 'Resource published.';
    }
    await render({loading:false});
    flash(message);
  } catch (error) {
    flash(error.message, true);
  } finally {
    button.disabled = false;
  }
});

view.addEventListener('click', async event => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const action = button.dataset.act;
  const node = button.closest('.post');
  const path = node ? '/posts/' + node.dataset.post : '';
  button.disabled = true;
  try {
    if (action === 'retry') return await render();
    if (action === 'comments') {
      const area = node.querySelector('.comments');
      if (area.hidden) await showComments(node);
      else {
        area.hidden = true;
        button.setAttribute('aria-expanded','false');
      }
    } else if (action === 'share') {
      const url = new URL('/#post/' + node.dataset.post,location.origin).href;
      if (navigator.share) {
        try { await navigator.share({ title:node.querySelector('h2').textContent, url }); }
        catch (error) { if (error.name !== 'AbortError') window.prompt('Copy post link',url); }
      } else {
        try { await navigator.clipboard.writeText(url); flash('Post link copied.'); }
        catch { window.prompt('Copy post link',url); }
      }
    } else if (action === 'reaction' || action === 'bookmark') {
      if (!signedUp()) return;
      if (action === 'reaction') await api(path + '/reaction','PUT',{kind:button.dataset.active === 'true' ? null : button.dataset.kind});
      else await api(path + '/bookmark','PUT',{saved:button.getAttribute('aria-pressed') !== 'true'});
      await refreshCard(node);
    } else if (action === 'more') {
      const run = sequence;
      const posts = await api('/feed?topic=' + encodeURIComponent(topic) + '&before=' + feedBefore);
      if (run !== sequence) return;
      $('#posts').insertAdjacentHTML('beforeend',posts.map(card).join(''));
      feedBefore = posts.length === 25 ? posts.at(-1).created : null;
      button.hidden = !feedBefore;
    } else if (action === 'delete-comment') {
      if (!window.confirm('Delete this comment?')) return;
      await api(path + '/comments/' + button.dataset.id,'DELETE');
      await showComments(node);
    } else if (action === 'delete-post') {
      if (!window.confirm('Delete this post and its comments?')) return;
      await api(path,'DELETE');
      if (location.hash.startsWith('#post/')) location.hash = '#home';
      else await render({loading:false});
    } else if (action === 'delete-file' || action === 'delete-resource') {
      if (!window.confirm('Delete this item?')) return;
      await api((action === 'delete-file' ? '/files/' : '/admin/resources/') + button.dataset.id,'DELETE');
      await render({loading:false});
    }
  } catch (error) {
    flash(error.message, true);
  } finally {
    button.disabled = false;
  }
});

view.addEventListener('change', event => {
  const field = event.target;
  if (field.id === 'topic') {
    topic = field.value;
    render({loading:false});
  } else if (field.id === 'resourceFilter') {
    filters[current] = field.value;
    $('#resources').innerHTML = resourceCards(current);
  } else if (field.id === 'adminSection') {
    $('#adminCategory').innerHTML = options(field.value === 'notice' ? noticeTypes : studyTypes);
    $('#resourceUrl').required = field.value === 'notice';
  }
});

function menu(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#menu').setAttribute('aria-expanded',String(open));
}
$('#menu').addEventListener('click', () => menu($('#menu').getAttribute('aria-expanded') === 'false'));
$('#sidebar').addEventListener('click', event => {
  if (event.target.closest('a')) menu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#menu').getAttribute('aria-expanded') === 'true') {
    menu(false);
    $('#menu').focus();
  }
});
window.addEventListener('hashchange', () => {
  menu(false);
  flash('');
  render();
  $('#heading').focus({preventScroll:true});
  window.scrollTo(0,0);
});
setInterval(() => {
  if (!document.hidden && (current === 'notice' || current === 'study') && view.getAttribute('aria-busy') === 'false') render({loading:false});
}, 120000);

async function start() {
  try { session = await api('/session'); }
  catch (error) { flash(error.message,true); }
  updateSession();
  await render();
}
start();
