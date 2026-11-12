// Pure pipeline pieces for the hourly editorial run (fetch + provider are injected so tests need no network).
import { createHash } from 'node:crypto';
import { shared } from './shared.mjs';

const { editorialProblems, editorialLimits, isRealDate, httpsHref, asciiDigits, slug, dhakaDay } = shared;
const decode = text => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

export function htmlToText(html, max = 6000) {
  return decode(String(html).replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function extractCandidates(html, baseUrl, keywords, limit = 8) {
  const out = [], seen = new Set();
  const base = new URL(baseUrl);
  for (const match of String(html).matchAll(/<a\s[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(decode(match[1]), base); } catch { continue; }
    if (url.protocol !== 'https:' || url.host !== base.host || seen.has(url.href)) continue;
    const title = htmlToText(match[2], 200);
    if (title.length < 12) continue;
    const hay = (title + ' ' + url.pathname).toLowerCase();
    if (!keywords.some(word => hay.includes(word.toLowerCase()))) continue;
    seen.add(url.href);
    out.push({ title, url: url.href });
    if (out.length >= limit) break;
  }
  return out;
}

const numbersIn = text => (asciiDigits(text).match(/\d+/g) || []).map(n => String(Number(n)));
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Every number the model writes must exist in the source text; a deadline must be a real date whose parts appear in the source.
export function verifyAi(result, pageText, allowedCategories) {
  const problems = [];
  if (!result || result.relevant === false) return ['not relevant'];
  const sourceNumbers = new Set(numbersIn(pageText));
  const text = `${result.title || ''} ${result.summary || ''}`;
  if (typeof result.title !== 'string' || result.title.trim().length < 5 || result.title.length > editorialLimits.title) problems.push('bad title');
  if (typeof result.summary !== 'string' || result.summary.trim().length < 20 || result.summary.length > 500) problems.push('bad summary');
  for (const n of numbersIn(text)) if (!sourceNumbers.has(n)) problems.push(`number ${n} not in source`);
  if (!allowedCategories.includes(result.category)) problems.push('bad category');
  if (result.deadline) {
    if (!isRealDate(result.deadline)) problems.push('deadline is not a real date');
    else {
      const [y, m, d] = result.deadline.split('-').map(Number);
      const source = asciiDigits(pageText).toLowerCase();
      const monthOk = new RegExp(`\\b0?${m}\\b|${MONTH_NAMES[m - 1].slice(0, 3)}|জানুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর`).test(source);
      if (!sourceNumbers.has(String(d)) || !sourceNumbers.has(String(y)) || !monthOk) problems.push('deadline not found in source');
    }
  }
  return problems;
}

export const itemId = (source, url) => `${slug(source.id)}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`;

export function mergeFeed(feed, items, { now = Date.now(), digest } = {}) {
  const next = JSON.parse(JSON.stringify(feed));
  const known = new Set(next.notices.map(n => n.url).filter(Boolean));
  const fresh = items.filter(item => !known.has(item.url));
  next.notices = [...fresh, ...next.notices].sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : b.publishedAt < a.publishedAt ? -1 : 0));
  // Keep human-curated items; trim the oldest AI items first when over the limit.
  while (next.notices.length > editorialLimits.notices) {
    const index = [...next.notices].reverse().findIndex(n => n.ai === true);
    next.notices.splice(index >= 0 ? next.notices.length - 1 - index : next.notices.length - 1, 1);
  }
  next.checkedAt = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  if (digest) next.digest = { text: digest, generatedAt: next.checkedAt };
  return { feed: next, added: fresh.length };
}

export async function runPipeline({ feed, config, fetchText, provider, now = Date.now(), log = () => {} }) {
  const allowed = shared.noticeTypes;
  const known = new Set(feed.notices.map(n => n.url).filter(Boolean));
  const created = [];
  const stats = { sources: 0, failed: 0, candidates: 0, rejected: 0, calls: 0 };
  const budget = config.maxNewPerRun ?? 8;
  for (const source of config.sources) {
    if (created.length >= budget) break;
    stats.sources++;
    let listing;
    try { listing = await fetchText(source.url); } catch (error) { stats.failed++; log(`source ${source.id}: ${error.message}`); continue; }
    for (const candidate of extractCandidates(listing, source.url, config.keywords, 6)) {
      if (created.length >= budget || stats.calls >= 40) break;
      if (known.has(candidate.url)) continue;
      stats.candidates++;
      try {
        const text = htmlToText(await fetchText(candidate.url));
        if (text.length < 80) { stats.rejected++; continue; }
        stats.calls++;
        const result = await provider.summarize({ title: candidate.title, text, source: source.name });
        const problems = verifyAi(result, text, allowed);
        if (problems.length) { stats.rejected++; log(`rejected ${candidate.url}: ${problems.join(', ')}`); continue; }
        created.push({ id: itemId(source, candidate.url), category: result.category, title: result.title.trim(), summary: result.summary.trim(),
          publishedAt: dhakaDay(now), source: source.name, url: candidate.url, ...(result.deadline ? { deadline: result.deadline } : {}), ai: true });
        known.add(candidate.url);
      } catch (error) { stats.rejected++; log(`error ${candidate.url}: ${error.message}`); }
    }
  }
  const { feed: merged, added } = mergeFeed(feed, created, { now });
  const problems = editorialProblems(merged);
  if (problems.length) throw new Error('Pipeline produced an invalid feed: ' + problems.slice(0, 3).join('; '));
  return { feed: merged, added, stats };
}

// HTTPS-only fetch with a size cap, timeout and a polite user agent. Redirects must stay on https.
export async function httpFetchText(url) {
  if (!httpsHref(url)) throw new Error('only https allowed');
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'AcademicAdmissionBot/2.0 (+https://github.com/ruhulaminrevens/Academic-Admission)', accept: 'text/html,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (new URL(res.url).protocol !== 'https:') throw new Error('redirected to non-https');
  const reader = res.body.getReader();
  let size = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1_500_000) { await reader.cancel(); break; } chunks.push(value); }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
