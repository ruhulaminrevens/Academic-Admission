// ---- Public pages (server-side rendered), SEO documents, calendar/RSS exports, static assets ----

// ---------- static assets ----------

const binaryCache = new Map();
const IMMUTABLE = 'public, max-age=31536000, immutable';

function assetFile(path) {
  const file = assets.files[path];
  if (!file) return null;
  if (file.text !== undefined) return textResponse(file.text, file.type, 'public, max-age=3600');
  let bytes = binaryCache.get(path);
  if (!bytes) {
    bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
    binaryCache.set(path, bytes);
  }
  return textResponse(bytes, file.type, 'public, max-age=86400');
}

function staticRoute(path) {
  if (path.startsWith('/assets/')) {
    const name = path.slice(8);
    if (name === assets.names.js) return response(assets.client, 'application/javascript; charset=utf-8', { cache: IMMUTABLE });
    if (name === assets.names.css) return response(assets.css, 'text/css; charset=utf-8', { cache: IMMUTABLE });
    if (name === assets.names.theme) return response(assets.theme, 'application/javascript; charset=utf-8', { cache: IMMUTABLE });
    return response('Not found', 'text/plain; charset=utf-8', { status: 404 });
  }
  if (path === '/sw.js') return response(assets.sw, 'application/javascript; charset=utf-8', { cache: 'no-cache', headers: { 'Service-Worker-Allowed': '/' } });
  if (path === '/favicon.ico') return assetFile('/favicon-32.png');
  return assetFile(path);
}

// ---------- head / structured data ----------

const jsonLd = value => `<script type="application/ld+json">${jsonForHtml(value)}</script>`;

function buildHead(meta, origin) {
  const url = origin + meta.path;
  const title = meta.path === '/' ? `${SITE_NAME} — Bangladesh admission notices, study & community` : `${meta.title} | ${SITE_NAME}`;
  const description = truncate(meta.description, 200);
  const image = origin + (meta.image || '/og-image.png');
  const robots = meta.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:type" content="${meta.type || 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${SITE_NAME} — Bangladesh admission notices and student community">`,
    '<meta property="og:locale" content="bn_BD">',
    meta.published ? `<meta property="article:published_time" content="${esc(meta.published)}">` : '',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    ...(meta.jsonld || []).map(jsonLd),
  ].filter(Boolean).join('\n');
}

const breadcrumb = (origin, trail) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: origin + path })),
});

const itemList = (origin, items, pathOf) => ({
  '@type': 'ItemList', numberOfItems: items.length,
  itemListElement: items.slice(0, 30).map((item, index) => ({ '@type': 'ListItem', position: index + 1, url: origin + pathOf(item), name: item.title })),
});

function organizationLd(origin) {
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: origin, logo: origin + '/icon-512.png' },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: origin, inLanguage: 'bn',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: origin + '/notices?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } },
  ];
}

// ---------- page loader ----------

const anonymous = { id: '' };

async function resolvePage(path, url, env, ctx, origin) {
  const topic = topics.includes(url.searchParams.get('topic')) ? url.searchParams.get('topic') : '';
  if (path === '/') {
    const [section, stats, top] = await Promise.all([loadSection(env, 'notice'), siteStats(env), topPosts(env, anonymous)]);
    const data = { notices: section.items, checkedAt: section.checkedAt, live: section.live, digest: section.digest, stats, top };
    return { content: pageHome(data, ctx), meta: {
      title: SITE_NAME, path, description: 'বাংলাদেশের বিশ্ববিদ্যালয়, শিক্ষা বোর্ড ও সরকারি admission notice, deadline countdown, study guideline এবং শিক্ষার্থীদের community — মূল উৎসের লিংকসহ এক জায়গায়।',
      jsonld: [...organizationLd(origin), { '@context': 'https://schema.org', '@type': 'WebPage', name: SITE_NAME, url: origin, inLanguage: 'bn' }],
    } };
  }
  if (path === '/notices') {
    const section = await loadSection(env, 'notice');
    return { content: pageNotices({ notices: section.items, checkedAt: section.checkedAt, live: section.live }, ctx), meta: {
      title: 'Notice Board — admission, exam ও holiday notices', path, description: 'বাংলাদেশের ভর্তি, পরীক্ষা, ছুটি ও সরকারি শিক্ষা-নোটিশ — মূল উৎসের লিংক ও deadline countdown সহ।',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Notice Board', url: origin + path, inLanguage: 'bn', mainEntity: itemList(origin, section.items, item => '/notice/' + item.id) }, breadcrumb(origin, [['Home', '/'], ['Notice Board', '/notices']])],
    } };
  }
  let match = path.match(/^\/notice\/([a-z0-9][a-z0-9-]{0,89})$/);
  if (match) {
    const item = await findNotice(env, match[1]);
    if (!item) return null;
    const section = await loadSection(env, 'notice');
    const iso = new Date(item.created).toISOString();
    return { content: pageNotice({ item, related: section.items.filter(other => other.id !== item.id && other.category === item.category).slice(0, 3) }, ctx), meta: {
      title: truncate(item.title, 80), path, type: 'article', published: iso, description: item.summary, image: assets.files['/og-' + item.id + '.png'] ? '/og-' + item.id + '.png' : '/og-image.png',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: truncate(item.title, 110), description: truncate(item.summary, 250), datePublished: iso, dateModified: iso, inLanguage: 'bn',
        mainEntityOfPage: origin + path, image: [origin + (assets.files['/og-' + item.id + '.png'] ? '/og-' + item.id + '.png' : '/og-image.png')], isBasedOn: item.url || undefined,
        author: { '@type': 'Organization', name: item.source }, publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: origin + '/icon-512.png' } } },
        breadcrumb(origin, [['Home', '/'], ['Notice Board', '/notices'], [truncate(item.title, 60), path]])],
    } };
  }
  if (path === '/study') {
    const [section, top] = await Promise.all([loadSection(env, 'study'), topPosts(env, anonymous)]);
    return { content: pageStudy({ items: section.items, top, checkedAt: section.checkedAt, live: section.live }, ctx), meta: {
      title: 'Study & Guidelines — tips, video ও website', path, description: 'Study tips, শিক্ষামূলক video, দরকারি website এবং গত ৭ দিনের আলোচিত community পোস্ট।',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Study & Guidelines', url: origin + path, inLanguage: 'bn' }, breadcrumb(origin, [['Home', '/'], ['Study & Guidelines', '/study']])],
    } };
  }
  if (path === '/community') {
    const [{ posts, more }, top] = await Promise.all([communityFeed(env, anonymous, topic, 0), topPosts(env, anonymous)]);
    return { content: pageCommunity({ posts, more, top, topic }, ctx), meta: {
      title: 'Community — প্রশ্ন, উত্তর ও অভিজ্ঞতা', path, description: 'ভর্তি প্রস্তুতি, study ও সাধারণ বিষয়ে শিক্ষার্থীদের প্রশ্ন, উত্তর ও অভিজ্ঞতা শেয়ার করুন।',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Community', url: origin + path, inLanguage: 'bn', mainEntity: itemList(origin, posts, post => '/post/' + post.id) }, breadcrumb(origin, [['Home', '/'], ['Community', '/community']])],
    } };
  }
  match = path.match(/^\/post\/([a-f0-9-]{36})$/);
  if (match && isUuid(match[1])) {
    const post = (await feed(env, anonymous, 'WHERE p.id = ?', [match[1]], 'p.created DESC', 1))[0];
    if (!post) return null;
    const iso = new Date(post.created).toISOString();
    return { content: pagePost({ post }, ctx), meta: {
      title: truncate(post.title, 80), path, type: 'article', published: iso, description: post.body,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: truncate(post.title, 110), text: truncate(post.body, 500), datePublished: iso, url: origin + path, inLanguage: 'bn',
        author: { '@type': 'Person', name: post.name },
        interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: post.comments }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likes + post.helpful }] },
        breadcrumb(origin, [['Home', '/'], ['Community', '/community'], [truncate(post.title, 60), path]])],
    } };
  }
  if (path === '/about') {
    return { content: pageAbout({}, ctx), meta: {
      title: 'About & FAQ', path, description: 'Academic Admission কীভাবে কাজ করে, নোটিশের তথ্য কোথা থেকে আসে এবং আপনার ডেটা কীভাবে সুরক্ষিত থাকে।',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, breadcrumb(origin, [['Home', '/'], ['About', '/about']])],
    } };
  }
  if (path === '/privacy') return { content: pagePrivacy(), meta: { title: 'Privacy Policy', path, description: 'আমরা কোন তথ্য সংরক্ষণ করি এবং আপনি কীভাবে নিয়ন্ত্রণ করবেন।' } };
  if (path === '/terms') return { content: pageTerms(), meta: { title: 'Terms of Use', path, description: 'Academic Admission ব্যবহারের শর্তাবলি।' } };
  if (path === '/admissions') return { content: pageAdmissions(await admissionCalendar(env)),
    meta: { title: 'ভর্তি ক্যালেন্ডার ২০২৬–২৭', path, description: 'বাংলাদেশের অফিসিয়াল বিশ্ববিদ্যালয় ভর্তি সময়সূচি এবং আবেদন পরিকল্পনা।' } };
  if (path === '/applications') return { content: pageHead('Student dashboard', 'My Applications', 'নিজের আবেদন পরিকল্পনা দেখুন।'),
    meta: { title: 'My Applications', path, description: 'Private application shortlist', noindex: true } };
  if (path === '/account' || path === '/admin') {
    return { content: `<section class="container page-head"><h1 id="heading" tabindex="-1">${path === '/admin' ? 'Admin console' : 'Account'}</h1><div class="skeleton skeleton--block"></div></section>`,
      meta: { title: path === '/admin' ? 'Admin console' : 'Account', path, description: 'Private workspace', noindex: true } };
  }
  return null;
}

async function renderPage(request, env, url) {
  const origin = siteOrigin(url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  const settings = publicSettings(await getSettings(env));
  const ctx = { now: Date.now(), user: { signedIn: false, profile: null, rank: 0 }, settings };
  let view = await resolvePage(path, url, env, ctx, origin);
  let status = 200;
  if (!view) {
    status = 404;
    view = { content: pageNotFound(), meta: { title: 'পাতা পাওয়া যায়নি', path: '/404', description: 'এই পাতাটি পাওয়া যায়নি।', noindex: true } };
  }
  const html = assets.html
    .replace('%%HEAD%%', () => buildHead(view.meta, origin))
    .replace('%%HEADER%%', () => renderHeader())
    .replace('%%CONTENT%%', () => view.content)
    .replace('%%FOOTER%%', () => renderFooter(settings))
    .replace('%%TABBAR%%', () => renderTabbar());
  const noindex = view.meta.noindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {};
  return response(html, 'text/html; charset=utf-8', { status, headers: { 'Content-Security-Policy': contentSecurityPolicy(url), ...noindex } });
}

function errorPage(status, message) {
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status} | ${SITE_NAME}</title>
<link rel="stylesheet" href="/assets/${assets.names.css}"></head><body><main class="container notfound"><div class="notfound-art" aria-hidden="true">${status}</div>
<h1>${esc(message)}</h1><p class="lead"><a href="/">← Home</a></p></main></body></html>`;
}

// ---------- sitemap / robots / RSS / ICS / security.txt ----------

async function dynamicPublic(path, env, url) {
  const origin = siteOrigin(url);
  if (path === '/robots.txt') {
    return textResponse(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /admin\nDisallow: /private/\n\nSitemap: ${origin}/sitemap.xml\n`, 'text/plain; charset=utf-8', 'public, max-age=3600');
  }
  if (path === '/sitemap.xml') {
    const [section, posts] = await Promise.all([loadSection(env, 'notice'), rows(env, 'SELECT id, created FROM posts ORDER BY created DESC LIMIT 500')]);
    const day = ms => new Date(ms).toISOString().slice(0, 10);
    const today = day(Date.now());
    const entries = [['/', today, 'hourly', 1], ['/notices', today, 'hourly', 0.9], ['/admissions', today, 'hourly', 0.9], ['/study', today, 'daily', 0.7], ['/community', today, 'daily', 0.7], ['/about', today, 'monthly', 0.4], ['/privacy', today, 'yearly', 0.2], ['/terms', today, 'yearly', 0.2],
      ...section.items.slice(0, 200).map(item => ['/notice/' + item.id, day(item.created), 'weekly', 0.8]),
      ...posts.map(post => ['/post/' + post.id, day(post.created), 'weekly', 0.5])];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([loc, lastmod, freq, priority]) =>
      `<url><loc>${xmlEscape(origin + loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n')}\n</urlset>\n`;
    return textResponse(body, 'application/xml; charset=utf-8', 'public, max-age=600');
  }
  if (path === '/feed.xml') {
    const section = await loadSection(env, 'notice');
    const items = section.items.slice(0, 40).map(item => `<item><title>${xmlEscape(item.title)}</title><link>${xmlEscape(origin + '/notice/' + item.id)}</link>
<guid isPermaLink="true">${xmlEscape(origin + '/notice/' + item.id)}</guid><pubDate>${new Date(item.created).toUTCString()}</pubDate><category>${xmlEscape(item.category)}</category>
<description>${xmlEscape(item.summary)}</description></item>`).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SITE_NAME} — Notices</title><link>${xmlEscape(origin)}</link>
<description>বাংলাদেশের admission, পরীক্ষা, ছুটি ও সরকারি শিক্ষা-নোটিশ।</description><language>bn</language><lastBuildDate>${new Date(Date.parse(section.checkedAt)).toUTCString()}</lastBuildDate>
<atom:link href="${xmlEscape(origin + '/feed.xml')}" rel="self" type="application/rss+xml"/>\n${items}\n</channel></rss>\n`;
    return textResponse(body, 'application/rss+xml; charset=utf-8', 'public, max-age=300');
  }
  const ics = path.match(/^\/ics\/([a-z0-9][a-z0-9-]{0,89}|[a-f0-9-]{36})\.ics$/);
  if (ics) {
    const item = await findNotice(env, ics[1]);
    required(item && item.deadline, 404, 'No deadline for this notice.');
    return textResponse(buildIcs(item, origin, url.hostname), 'text/calendar; charset=utf-8', 'public, max-age=300',
      { 'Content-Disposition': `attachment; filename="deadline-${item.id.slice(0, 40)}.ics"` });
  }
  if (path === '/.well-known/security.txt') {
    required(env.SECURITY_CONTACT, 404, 'Not found.');
    const expires = new Date(Date.now() + 365 * 86400000).toISOString();
    return textResponse(`Contact: ${env.SECURITY_CONTACT}\nExpires: ${expires}\nPreferred-Languages: bn, en\nCanonical: ${origin}/.well-known/security.txt\n`, 'text/plain; charset=utf-8', 'public, max-age=86400');
  }
  return null;
}

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsFold(line) {
  let out = '';
  let size = 0;
  let max = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > max) { out += '\r\n '; size = 0; max = 74; }
    out += char;
    size += bytes;
  }
  return out;
}

function buildIcs(item, origin, host) {
  const compact = date => date.replace(/-/g, '');
  const next = new Date(Date.parse(item.deadline + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const page = `${origin}/notice/${item.id}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Academic Admission//Deadlines//BN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${item.id}@${host}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compact(item.deadline)}`, `DTEND;VALUE=DATE:${compact(next)}`,
    `SUMMARY:${icsEscape('Deadline: ' + item.title)}`,
    `DESCRIPTION:${icsEscape(truncate(item.summary, 500) + '\n\n' + (item.url ? 'Source: ' + item.url + '\n' : '') + page)}`,
    `URL:${page}`, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline tomorrow', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
