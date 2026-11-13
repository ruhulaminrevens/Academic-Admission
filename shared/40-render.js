// HTML builders shared by the Worker (server-side rendering) and the browser (hydration).
// Pure functions: no DOM, no network. Interactive behaviour is attached by the client through
// event delegation on data-act / data-link attributes.

export const defaultCtx = () => ({ now: Date.now(), user: { signedIn: false, profile: null, rank: 0 }, settings: {} });
const rankOf = ctx => ctx?.user?.rank || 0;

export const navItems = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/admissions', label: 'Calendar', icon: 'calendar' },
  { href: '/notices', label: 'Notice Board', short: 'Notices', icon: 'bell' },
  { href: '/study', label: 'Study & Guidelines', short: 'Study', icon: 'book' },
  { href: '/community', label: 'Community', icon: 'users' },
  { href: '/account', label: 'Account', icon: 'user' },
];

export function renderHeader() {
  const links = navItems.slice(0, -1).map(item =>
    `<a href="${item.href}" data-link data-nav="${item.href}">${icon(item.icon, 17)}<span>${esc(item.label)}</span></a>`).join('');
  return `<div class="container topbar-inner">
    <a class="brand" href="/" data-link aria-label="Academic Admission — Home">${logoMark(36)}<span class="brand-text">Academic<br>Admission</span></a>
    <nav class="nav" id="nav" aria-label="Main navigation">${links}</nav>
    <div class="topbar-actions">
      <button class="btn btn--icon" type="button" data-act="palette" aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">${icon('search')}</button>
      <button class="btn btn--icon" type="button" data-act="theme" aria-label="Change theme" title="Change theme">${icon('moon')}</button>
      <a class="btn btn--icon" id="adminNav" href="/admin" data-link data-nav="/admin" aria-label="Admin console" title="Admin console" hidden>${icon('sliders')}</a>
      <div class="session" id="session"><a class="btn btn--primary btn--sm" href="/account" data-link>Sign in</a></div>
    </div>
  </div>`;
}

export function renderTabbar() {
  return navItems.map(item =>
    `<a href="${item.href}" data-link data-nav="${item.href}">${icon(item.icon, 22)}<span>${esc(item.short || item.label)}</span></a>`).join('');
}

export function renderFooter(settings = {}) {
  const social = settings.social || {};
  const socials = [['facebook', 'Facebook'], ['telegram', 'Telegram'], ['whatsapp', 'WhatsApp'], ['youtube', 'YouTube']]
    .filter(([key]) => social[key])
    .map(([key, label]) => `<a class="social" href="${esc(social[key])}" target="_blank" rel="noopener noreferrer me">${icon('external', 14)}${label}</a>`).join('');
  const contact = settings.contactEmail ? `<a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>` : '';
  return `<div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/" data-link>${logoMark(34)}<span class="brand-text">Academic<br>Admission</span></a>
      <p class="muted">${esc(settings.tagline || 'বাংলাদেশের admission notice, study resource ও student community — এক জায়গায়।')}</p>
      ${socials ? `<div class="socials">${socials}</div>` : ''}
    </div>
    <div><h4>Explore</h4>
      <a href="/admissions" data-link>ভর্তি ক্যালেন্ডার</a><a href="/notices" data-link>Notice Board</a><a href="/study" data-link>Study &amp; Guidelines</a>
      <a href="/community" data-link>Community</a><a href="/account" data-link>Account</a></div>
    <div><h4>Stay updated</h4>
      <a href="/feed.xml">${icon('rss', 14)} RSS feed</a><a href="/sitemap.xml">Sitemap</a>
      <button class="linkish" type="button" data-act="install" hidden>${icon('download', 14)} Install app</button></div>
    <div><h4>About</h4>
      <a href="/about" data-link>About &amp; FAQ</a><a href="/privacy" data-link>Privacy</a><a href="/terms" data-link>Terms</a>${contact}</div>
  </div>
  <div class="container footer-bottom"><span>© ${new Date().getUTCFullYear()} Academic Admission · বাংলাদেশের শিক্ষার্থীদের জন্য</span>
    <span class="muted">সিদ্ধান্ত নেওয়ার আগে সবসময় মূল বিজ্ঞপ্তি যাচাই করুন।</span></div>`;
}

// ---------- small building blocks ----------

export const chip = (label, tone) => `<span class="chip chip--${esc(slug(tone || label))}">${esc(label)}</span>`;

export function avatar(name = '?', size = '') {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  const initial = [...String(name).trim()][0] || '?';
  return `<span class="avatar avatar--${hash % 8} ${size}" aria-hidden="true">${esc(initial.toUpperCase())}</span>`;
}

export function roleBadge(role) {
  if (!role || role === 'member') return '';
  return `<span class="role role--${esc(role)}">${icon(role === 'moderator' ? 'shield' : 'crown', 12)}${esc(roleLabel[role] || role)}</span>`;
}

export function deadlineBadge(item, now) {
  const info = deadlineInfo(item.deadline, now);
  if (!info) return '';
  const hint = item.deadlineInferred ? 'নোটিশের লেখা থেকে অনুমান করা — মূল বিজ্ঞপ্তিতে যাচাই করুন' : 'আবেদনের শেষ তারিখ';
  return `<span class="deadline deadline--${info.tone}" title="${esc(hint)}">${icon('clock', 14)}${esc(info.label)}${item.deadlineInferred ? '<sup>~</sup>' : ''}</span>`;
}

export const emptyState = (message, action = '') => `<div class="empty"><div class="empty-art" aria-hidden="true">${icon('sparkle', 28)}</div><p>${esc(message)}</p>${action}</div>`;

export function freshnessBadge(data, now) {
  if (!data?.checkedAt) return '';
  const checked = Date.parse(data.checkedAt);
  const hours = (now - checked) / 3600000;
  const tone = data.live === false ? 'warn' : hours > 6 ? 'warn' : 'ok';
  const text = data.live === false ? 'Saved snapshot' : 'Feed checked';
  return `<span class="live live--${tone}"><i></i>${text} · ${esc(timeAgo(checked, now))}</span>`;
}

export function sectionHead(eyebrow, title, text = '', action = '') {
  return `<div class="section-head" data-reveal><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${title}</h2>${text ? `<p class="muted">${text}</p>` : ''}</div>${action}</div>`;
}

// ---------- cards ----------

export function noticeCard(item, ctx, opts = {}) {
  const now = ctx.now;
  const href = `/notice/${encodeURIComponent(item.id)}`;
  const ai = item.ai ? `<span class="tag" title="AI-assisted সারাংশ — মূল উৎসে যাচাই করুন">${icon('sparkle', 12)}AI</span>` : '';
  return `<article class="card notice card--hover" data-tilt data-reveal data-category="${esc(item.category)}" data-id="${esc(item.id)}">
    <div class="notice-top">${chip(item.category)}${ai}<time class="muted" datetime="${new Date(item.created).toISOString().slice(0, 10)}">${esc(fmtDate(item.created))}</time></div>
    <h3 class="notice-title"><a href="${href}" data-link>${esc(item.title)}</a></h3>
    <p class="notice-sum">${esc(truncate(item.summary, opts.long ? 320 : 170))}</p>
    <div class="notice-foot">
      <span class="muted source">${icon('shield', 14)}${esc(item.source)}</span>${deadlineBadge(item, now)}
    </div>
    <div class="notice-actions">
      <a class="btn btn--ghost btn--sm" href="${href}" data-link>বিস্তারিত ${icon('arrow', 14)}</a>
      ${item.url ? `<a class="btn btn--subtle btn--sm" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 14)}Source</a>` : ''}
      <button class="btn btn--subtle btn--sm btn--icon" type="button" data-act="share" data-title="${esc(item.title)}" data-url="${esc(href)}" aria-label="Share">${icon('share', 15)}</button>
    </div>
  </article>`;
}

export function studyCard(item) {
  return `<article class="card study card--hover" data-tilt data-reveal data-category="${esc(item.category)}">
    <div class="notice-top">${chip(item.category)}<span class="muted">${esc(fmtDate(item.created))}</span></div>
    <h3 class="notice-title">${esc(item.title)}</h3>
    <p class="notice-sum">${esc(item.summary)}</p>
    <div class="notice-foot"><span class="muted source">${icon('book', 14)}${esc(item.source)}${item.origin === 'Admin' ? '' : ''}</span></div>
    ${item.url ? `<div class="notice-actions"><a class="btn btn--ghost btn--sm" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 14)}Open resource</a></div>` : ''}
  </article>`;
}

export function postCard(post, ctx, opts = {}) {
  const rank = rankOf(ctx);
  const signedProfile = Boolean(ctx.user?.profile);
  const href = `/post/${encodeURIComponent(post.id)}`;
  const truncated = !opts.full && post.body.length > 420;
  const body = opts.full ? linkify(post.body) : esc(truncate(post.body, 420));
  const react = (kind, name, label, count) => `<button class="act" type="button" data-act="reaction" data-kind="${kind}" aria-pressed="${post.myReaction === kind}">${icon(name, 16)}<span>${label}</span><b>${count}</b></button>`;
  return `<article class="card post${post.pinned ? ' post--pinned' : ''}" data-post="${esc(post.id)}" data-created="${Number(post.created)}" data-reveal>
    <header class="post-head">${avatar(post.name)}
      <div><strong>${esc(post.name)}</strong> ${roleBadge(post.authorRole)}<div class="muted small">${esc(fmtDateTime(post.created))}${post.views ? ` · ${icon('eye', 12)} ${post.views}` : ''}</div></div>
      <div class="post-badges">${post.pinned ? `<span class="tag tag--pin">${icon('pin', 12)}Pinned</span>` : ''}${chip(post.topic, 'topic-' + post.topic)}</div>
    </header>
    <h3 class="post-title"><a href="${href}" data-link>${esc(post.title)}</a></h3>
    <p class="body">${body}</p>
    ${truncated ? `<a class="more" href="${href}" data-link>আরও পড়ুন ${icon('arrow', 14)}</a>` : ''}
    <div class="actions">
      ${react('like', 'heart', 'Like', post.likes)}${react('helpful', 'bulb', 'Helpful', post.helpful)}
      <button class="act" type="button" data-act="comments" aria-expanded="${opts.full ? 'true' : 'false'}">${icon('comment', 16)}<span>Comments</span><b>${post.comments}</b></button>
      <button class="act" type="button" data-act="share" data-title="${esc(post.title)}" data-url="${esc(href)}">${icon('share', 16)}<span>Share</span></button>
      ${signedProfile ? `<button class="act" type="button" data-act="bookmark" aria-pressed="${Boolean(post.saved)}">${icon('bookmark', 16)}<span>${post.saved ? 'Saved' : 'Save'}</span></button>` : ''}
      ${ctx.user?.signedIn && !post.mine ? `<button class="act" type="button" data-act="report-post" aria-label="Report post">${icon('flag', 16)}</button>` : ''}
      ${rank >= 1 ? `<button class="act" type="button" data-act="pin-post" aria-pressed="${Boolean(post.pinned)}">${icon('pin', 16)}<span>${post.pinned ? 'Unpin' : 'Pin'}</span></button>` : ''}
      ${post.mine || rank >= 1 ? `<button class="act act--danger" type="button" data-act="delete-post" aria-label="Delete post">${icon('trash', 16)}</button>` : ''}
    </div>
    <div class="comments" ${opts.full ? '' : 'hidden'}></div>
  </article>`;
}

export function miniPost(post) {
  return `<a class="mini" href="/post/${encodeURIComponent(post.id)}" data-link><strong>${esc(post.title)}</strong>
    <span class="muted small">${esc(post.topic)} · ${icon('comment', 12)} ${post.comments} · ${icon('heart', 12)} ${post.likes + post.helpful}</span></a>`;
}

export function deadlineCard(item, ctx) {
  const info = deadlineInfo(item.deadline, ctx.now);
  if (!info || info.days < 0) return '';
  const circumference = 2 * Math.PI * 34;
  const fraction = Math.min(1, Math.max(0.04, 1 - info.days / 60));
  return `<a class="card deadline-card card--hover deadline-card--${info.tone}" data-tilt data-reveal href="/notice/${encodeURIComponent(item.id)}" data-link>
    <svg class="ring" width="84" height="84" viewBox="0 0 84 84" aria-hidden="true"><circle class="ring-bg" cx="42" cy="42" r="34" fill="none" stroke-width="6"/>
      <circle class="ring-fg" cx="42" cy="42" r="34" fill="none" stroke-width="6" stroke-linecap="round" transform="rotate(-90 42 42)" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${(circumference * (1 - fraction)).toFixed(1)}"/></svg>
    <div class="ring-text"><b>${bn(info.days)}</b><span>${info.days === 0 ? 'আজ' : 'দিন'}</span></div>
    <div class="deadline-body">${chip(item.category)}<h3>${esc(truncate(item.title, 70))}</h3>
      <p class="muted small">${icon('calendar', 13)} ${esc(fmtDate(Date.parse(item.deadline + 'T00:00:00+06:00')))}${item.deadlineInferred ? ' · অনুমানকৃত' : ''}</p></div>
  </a>`;
}

export function composer(ctx) {
  if (ctx.user?.profile) {
    return `<form class="card composer" data-form="post"><h2>${icon('edit', 18)} নতুন পোস্ট</h2>
      <div class="field-row"><label>Topic<select name="topic">${topics.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="grow">Title<input name="title" minlength="3" maxlength="120" required placeholder="প্রশ্ন বা বিষয়ের শিরোনাম"></label></div>
      <label>Post<textarea name="body" minlength="3" maxlength="4000" required placeholder="বিস্তারিত লিখুন…"></textarea></label>
      <div class="form-foot"><span class="muted small">ভদ্র ভাষায় লিখুন। বিভ্রান্তিকর বা স্প্যাম পোস্ট report করা যায়।</span><button class="btn btn--primary" type="submit">${icon('send', 16)}Publish</button></div></form>`;
  }
  return `<div class="card composer composer--cta"><div class="composer-art" aria-hidden="true">${icon('users', 30)}</div>
    <div><h2>Join the discussion</h2><p class="muted">Post, comment, react ও save করতে একটি profile তৈরি করুন।</p></div>
    ${ctx.user?.signedIn ? '<a class="btn btn--primary" href="/account" data-link>Create profile</a>' :
      '<a class="btn btn--primary" href="/signin-with-chatgpt?return_to=%2Fcommunity" target="_top">Sign in with ChatGPT</a>'}</div>`;
}

export function shareRow(title, path) {
  return `<div class="share-row" role="group" aria-label="Share">
    <button class="btn btn--ghost btn--sm" type="button" data-act="share-to" data-net="whatsapp" data-title="${esc(title)}" data-url="${esc(path)}">WhatsApp</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="share-to" data-net="facebook" data-title="${esc(title)}" data-url="${esc(path)}">Facebook</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="share-to" data-net="telegram" data-title="${esc(title)}" data-url="${esc(path)}">Telegram</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="share-to" data-net="x" data-title="${esc(title)}" data-url="${esc(path)}">X</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="copy-link" data-url="${esc(path)}">${icon('link', 14)}Copy link</button></div>`;
}

export const pageHead = (eyebrow, title, text, extra = '') => `<section class="page-head container" data-reveal>
  <span class="eyebrow">${esc(eyebrow)}</span><h1 id="heading" tabindex="-1">${title}</h1><p class="lead">${text}</p>${extra}</section>`;
