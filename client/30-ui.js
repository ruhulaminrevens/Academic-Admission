// ---- Shell UI: theme, command palette, share, install, service worker, analytics, session ----

// ---------- theme ----------
function applyTheme(pref) {
  const theme = pref === 'light' || pref === 'dark' ? pref : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-pref', pref);
  $('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f7fb' : '#060912');
  const button = $('[data-act="theme"]');
  if (button) {
    const label = pref === 'auto' ? 'Theme: automatic' : pref === 'light' ? 'Theme: light' : 'Theme: dark';
    button.innerHTML = icon(theme === 'light' ? 'sun' : 'moon');
    button.setAttribute('aria-label', label); button.title = label;
  }
  aurora.refresh();
}
function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme-pref') || 'auto';
  const next = { auto: 'light', light: 'dark', dark: 'auto' }[current] || 'light';
  store.set('aa-theme', next === 'auto' ? '' : next);
  if (next === 'auto') { try { localStorage.removeItem('aa-theme'); } catch { /* ignore */ } }
  applyTheme(next);
  toast(next === 'auto' ? 'Theme follows your device' : `${next === 'light' ? 'Light' : 'Dark'} theme on`, 'info', 1800);
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if ((document.documentElement.getAttribute('data-theme-pref') || 'auto') === 'auto') applyTheme('auto'); });

// ---------- share ----------
function shareTo(net, title, path) {
  const url = encodeURIComponent(absoluteUrl(path)), text = encodeURIComponent(title);
  const target = {
    whatsapp: `https://wa.me/?text=${text}%20${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
  }[net];
  if (target) window.open(target, '_blank', 'noopener,noreferrer');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.className = 'sr-only';
    document.body.appendChild(area); area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    area.remove();
    return ok;
  }
}
async function shareItem(title, path) {
  const url = absoluteUrl(path);
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (error) { if (error?.name === 'AbortError') return; }
  }
  openDialog(`<div class="dialog-body"><h2>Share</h2><p class="muted">${esc(truncate(title, 100))}</p>${shareRow(title, path)}
    <div class="dialog-foot"><button class="btn btn--ghost" type="button" data-close>Close</button></div></div>`, { label: 'Share' });
}

// ---------- command palette ----------
const paletteCommands = [
  { label: 'Home', hint: 'Page', href: '/', icon: 'home' },
  { label: 'Notice Board', hint: 'Page', href: '/notices', icon: 'bell' },
  { label: 'Study & Guidelines', hint: 'Page', href: '/study', icon: 'book' },
  { label: 'Community', hint: 'Page', href: '/community', icon: 'users' },
  { label: 'My account', hint: 'Page', href: '/account', icon: 'user' },
  { label: 'About & FAQ', hint: 'Page', href: '/about', icon: 'info' },
  { label: 'Change theme', hint: 'Action', act: 'theme', icon: 'sun' },
  { label: 'RSS feed', hint: 'Link', href: '/feed.xml', icon: 'rss', external: true },
];
function openPalette() {
  if ($('#palette')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'palette'; dialog.className = 'dialog palette'; dialog.setAttribute('aria-label', 'Search');
  dialog.innerHTML = `<div class="palette-box"><div class="palette-input">${icon('search', 20)}<input type="search" placeholder="Search notices, study, posts or jump to a page…" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="palette-list" role="listbox" aria-label="Results"></div></div>`;
  document.body.appendChild(dialog);
  const input = $('input', dialog), list = $('.palette-list', dialog);
  let items = [], index = 0, token = 0;
  const render = () => {
    list.innerHTML = items.length ? items.map((item, i) =>
      `<a class="palette-item${i === index ? ' active' : ''}" role="option" aria-selected="${i === index}" href="${esc(item.href || '#')}" ${item.act ? `data-pact="${item.act}"` : item.external ? '' : 'data-link'}>
        <span class="palette-ico">${icon(item.icon || 'file', 18)}</span><span class="palette-label">${esc(item.label)}</span><span class="muted small">${esc(item.hint)}</span></a>`).join('')
      : '<p class="empty small">No results.</p>';
    $('.active', list)?.scrollIntoView({ block: 'nearest' });
  };
  const base = query => paletteCommands.filter(c => !query || c.label.toLowerCase().includes(query));
  const search = debounce(async query => {
    const mine = ++token;
    try {
      const result = await api('/search?q=' + encodeURIComponent(query));
      if (mine !== token) return;
      items = [
        ...base(query.toLowerCase()),
        ...result.notices.map(n => ({ label: n.title, hint: 'Notice · ' + n.category, href: '/notice/' + n.id, icon: 'bell' })),
        ...result.study.map(n => ({ label: n.title, hint: 'Study · ' + n.category, href: n.url || '/study', icon: 'book', external: Boolean(n.url) })),
        ...result.posts.map(p => ({ label: p.title, hint: 'Post · ' + p.topic, href: '/post/' + p.id, icon: 'comment' })),
      ];
      index = 0; render();
    } catch { /* keep static results */ }
  }, 180);
  input.addEventListener('input', () => {
    const query = input.value.trim();
    items = base(query.toLowerCase()); index = 0; render();
    if (query.length >= 2) search(query);
  });
  const choose = () => { const el = $$('.palette-item', list)[index]; if (el) el.click(); };
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); index = Math.min(items.length - 1, index + 1); render(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); index = Math.max(0, index - 1); render(); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(); }
    else if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  list.addEventListener('click', event => {
    const link = event.target.closest('.palette-item');
    if (!link) return;
    if (link.dataset.pact === 'theme') { event.preventDefault(); dialog.close(); cycleTheme(); return; }
    dialog.close();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  items = base(''); render();
  dialog.showModal(); input.focus();
}
addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
  else if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) { event.preventDefault(); openPalette(); }
});

// ---------- install prompt ----------
addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  S.installPrompt = event;
  $$('[data-act="install"]').forEach(el => { el.hidden = false; });
});
addEventListener('appinstalled', () => { S.installPrompt = null; $$('[data-act="install"]').forEach(el => { el.hidden = true; }); toast('App installed', 'success'); });
async function installApp() {
  if (!S.installPrompt) return toast('Use your browser menu → “Add to Home screen”.', 'info');
  S.installPrompt.prompt();
  await S.installPrompt.userChoice.catch(() => {});
  S.installPrompt = null;
}

// ---------- service worker ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost' && store.get('aa-sw') !== '1') return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

// ---------- privacy-friendly analytics ----------
const trackingAllowed = () => navigator.doNotTrack !== '1' && window.doNotTrack !== '1' && !navigator.globalPrivacyControl;
function utmFromUrl() {
  const params = new URLSearchParams(location.search);
  const found = { source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign') };
  if (found.source || found.medium || found.campaign) { try { sessionStorage.setItem('aa-utm', JSON.stringify(found)); } catch { /* ignore */ } return found; }
  try { return JSON.parse(sessionStorage.getItem('aa-utm') || 'null'); } catch { return null; }
}
let lastHit = '', firstHit = true;
function trackPage(path) {
  if (!trackingAllowed() || S.session.rank >= 2 || path === lastHit) return;
  lastHit = path;
  const body = { path, ref: firstHit ? document.referrer : '', w: innerWidth, lang: (navigator.language || '').slice(0, 2), utm: utmFromUrl() };
  fetch('/api/analytics/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin' }).catch(() => {});
  firstHit = false;
}

// ---------- session chrome ----------
function renderSession() {
  const slot = $('#session');
  const { signedIn, profile, rank } = S.session;
  if (slot) {
    if (profile) slot.innerHTML = `<a class="session-chip" href="/account" data-link title="My account">${avatar(profile.name)}<span class="session-name">${esc(truncate(profile.name, 18))}</span></a>`;
    else if (signedIn) slot.innerHTML = '<a class="btn btn--primary btn--sm" href="/account" data-link>Create profile</a>';
    else slot.innerHTML = `<a class="btn btn--primary btn--sm" href="/account" data-link>Sign in</a>`;
  }
  const admin = $('#adminNav');
  if (admin) admin.hidden = !(rank >= 1);
  const banner = $('#announce'), note = S.site?.announcement;
  if (banner) {
    const text = note ? note.text : S.site?.readonly ? 'The site is in read-only mode for maintenance. Browsing works; posting is paused.' : '';
    banner.hidden = !text;
    if (text) {
      banner.className = 'announce announce--' + (note ? note.level : 'warning');
      banner.innerHTML = `${icon(note?.level === 'success' ? 'check' : note?.level === 'warning' || !note ? 'alert' : 'info', 16)}<span></span>${note?.link ? `<a href="${esc(note.link)}" target="_blank" rel="noopener noreferrer">Learn more ${icon('arrow', 14)}</a>` : ''}`;
      banner.querySelector('span').textContent = text;
    }
  }
}
function markActiveNav(path) {
  $$('[data-nav]').forEach(link => {
    const href = link.getAttribute('data-nav');
    const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/') || (href === '/notices' && path.startsWith('/notice/')) || (href === '/community' && path.startsWith('/post/'));
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
