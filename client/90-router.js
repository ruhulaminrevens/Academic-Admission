// ---- Router and boot ----

async function loadSession() {
  try {
    const session = await api('/session');
    S.session = session; S.site = session.site || {}; S.version = session.version || '';
  } catch { /* offline: keep anonymous defaults */ }
}

const pageTitle = text => text ? `${text} | ${SITE_NAME}` : `${SITE_NAME} — Bangladesh admission notices, study & community`;
const cleanPath = () => location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : '/';

const routeTable = [
  { rx: /^\/$/, user: true, async load() {
    const [section, stats, top] = await Promise.all([api('/notice'), api('/stats'), api('/top')]);
    return { html: pageHome({ notices: section.items, checkedAt: section.checkedAt, live: section.live, digest: section.digest, stats, top }, ctxNow()), title: '' };
  } },
  { rx: /^\/notices$/, async load() {
    const section = await api('/notice');
    return { html: pageNotices({ notices: section.items, checkedAt: section.checkedAt, live: section.live }, ctxNow()), title: 'Notice Board' };
  } },
  { rx: /^\/notice\/([a-z0-9-]+)$/, async load(m) {
    const data = await api('/notice/' + encodeURIComponent(m[1]));
    return { html: pageNotice({ item: data.item, related: data.related }, ctxNow()), title: truncate(data.item.title, 70) };
  } },
  { rx: /^\/study$/, async load() {
    const [section, top] = await Promise.all([api('/study'), api('/top')]);
    return { html: pageStudy({ items: section.items, top, checkedAt: section.checkedAt, live: section.live }, ctxNow()), title: 'Study & Guidelines' };
  } },
  { rx: /^\/community$/, user: true, async load() {
    const topic = new URLSearchParams(location.search).get('topic') || '';
    const [posts, top] = await Promise.all([api('/feed' + (topic ? '?topic=' + encodeURIComponent(topic) : '')), api('/top')]);
    return { html: pageCommunity({ posts, more: posts.length >= 25, top, topic }, ctxNow()), title: 'Community' };
  } },
  { rx: /^\/post\/([a-f0-9-]{36})$/, user: true, async load(m) {
    const post = await api('/posts/' + m[1]);
    return { html: pagePost({ post }, ctxNow()), title: truncate(post.title, 70) };
  } },
  { rx: /^\/about$/, async load() { return { html: pageAbout({}, ctxNow()), title: 'About & FAQ' }; } },
  { rx: /^\/privacy$/, async load() { return { html: pagePrivacy(), title: 'Privacy Policy' }; } },
  { rx: /^\/terms$/, async load() { return { html: pageTerms(), title: 'Terms of Use' }; } },
  { rx: /^\/admissions$/, client: renderAdmissions, title: 'ভর্তি ক্যালেন্ডার' },
  { rx: /^\/applications$/, user: true, client: renderApplications, title: 'My Applications' },
  { rx: /^\/account$/, user: true, client: renderAccount, title: 'Account' },
  { rx: /^\/admin$/, user: true, client: renderAdmin, title: 'Admin console' },
];

function matchRoute(path) {
  for (const route of routeTable) { const m = route.rx.exec(path); if (m) return { route, m }; }
  return null;
}

async function renderRoute({ hydrate = false } = {}) {
  const path = cleanPath();
  S.path = path;
  const id = ++S.loadId;
  const view = $('#view');
  view.studentNavigation?.abort();
  const found = matchRoute(path);
  markActiveNav(path);
  document.body.dataset.page = found ? path.split('/')[1] || 'home' : 'notfound';

  if (hydrate && found && !found.route.client && !(found.route.user && S.session.signedIn)) {
    // Server-rendered markup is already correct for anonymous visitors: just attach behaviour.
    finishRender(view, path, document.title);
    return;
  }
  let html = '', title = '';
  try {
    if (found?.route.client) {
      view.setAttribute('aria-busy', 'true');
      const swap = async () => { await found.route.client(view); };
      title = found.route.title;
      await transition(swap, hydrate);
    } else if (found) {
      const result = await found.route.load(found.m);
      if (id !== S.loadId) return;
      html = result.html; title = result.title;
      await transition(() => { view.innerHTML = html; }, hydrate);
    } else {
      html = pageNotFound(); title = 'পাতা পাওয়া যায়নি';
      await transition(() => { view.innerHTML = html; }, hydrate);
    }
  } catch (error) {
    if (id !== S.loadId) return;
    if (error?.status === 404) { title = 'পাতা পাওয়া যায়নি'; await transition(() => { view.innerHTML = pageNotFound(); }, hydrate); }
    else { view.innerHTML = `<section class="container notfound"><h1 id="heading" tabindex="-1">লোড করা যায়নি</h1><p class="lead">${esc(error?.message || 'Please try again.')}</p><button class="btn btn--primary" type="button" data-act="reload">Try again</button></section>`; }
  }
  if (id !== S.loadId) return;
  finishRender(view, path, pageTitle(title));
}
actions.reload = () => renderRoute();

function finishRender(view, path, title) {
  view.removeAttribute('aria-busy');
  document.title = title;
  initFx(view);
  enhancePage();
  trackPage(path);
}

async function transition(update, skip) {
  if (skip || reduceMotion.matches || !document.startViewTransition) { await update(); return; }
  const t = document.startViewTransition(async () => { await update(); });
  try { await t.updateCallbackDone; } catch { /* ignore aborted transitions */ }
}

function navigate(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) { location.href = path; return; }
  const same = url.pathname === location.pathname && url.search === location.search;
  history[replace || same ? 'replaceState' : 'pushState']({ internal: true }, '', url.pathname + url.search + url.hash);
  if (url.hash && url.pathname === S.path) { document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' }); return; }
  scrollTo({ top: 0, behavior: 'instant' });
  renderRoute().then(() => { const heading = $('#heading'); if (heading) heading.focus({ preventScroll: true }); });
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[data-link]');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
addEventListener('popstate', () => renderRoute());

// legacy hash links (#notice, #study …) from the previous version
const legacyHashes = { '#home': '/', '#notice': '/notices', '#study': '/study', '#account': '/account', '#admin': '/admin' };

async function boot() {
  if (legacyHashes[location.hash] && location.pathname === '/') history.replaceState(null, '', legacyHashes[location.hash]);
  applyTheme(document.documentElement.getAttribute('data-theme-pref') || 'auto');
  await loadSession();
  renderSession();
  await renderRoute({ hydrate: true });
  registerServiceWorker();
  document.documentElement.classList.add('ready');
}
boot().catch(error => console.error('Boot failed', error));
