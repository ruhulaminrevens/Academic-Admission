import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates, htmlToText, verifyAi, runPipeline, mergeFeed } from '../scripts/lib/editorial-core.mjs';
import { makeProvider } from '../scripts/lib/providers.mjs';
import { editorialFixture } from './helpers.mjs';

const listing = `<ul><li><a href="/notice/1">ভর্তি বিজ্ঞপ্তি ২০২৬-২৭ প্রকাশিত</a></li><li><a href="http://evil.example/x">admission notice insecure</a></li>
<li><a href="https://other.example/y">admission notice other host</a></li><li><a href="/about">About us page here</a></li></ul>`;
const page = '<html><body><script>x()</script><p>২০২৬-২৭ শিক্ষাবর্ষের স্নাতক ভর্তির আবেদন ১০ ডিসেম্বর ২০২৬ পর্যন্ত চলবে। আবেদন ফি ৩৫০ টাকা।</p></body></html>';

test('candidate extraction keeps only same-host https links that look like notices', () => {
  const found = extractCandidates(listing, 'https://uni.example/', ['ভর্তি', 'admission']);
  assert.deepEqual(found.map(f => f.url), ['https://uni.example/notice/1']);
  assert.ok(!htmlToText(page).includes('x()'));
});
test('verification rejects invented numbers and dates', () => {
  const text = htmlToText(page);
  const good = { relevant: true, title: 'স্নাতক ভর্তি ২০২৬-২৭', summary: 'আবেদন ১০ ডিসেম্বর ২০২৬ পর্যন্ত। আবেদন ফি ৩৫০ টাকা।', category: 'Admission', deadline: '2026-12-10' };
  assert.deepEqual(verifyAi(good, text, ['Admission']), []);
  assert.ok(verifyAi({ ...good, summary: 'আবেদন ফি ৫০০ টাকা। আবেদন ১০ ডিসেম্বর ২০২৬ পর্যন্ত।' }, text, ['Admission']).some(p => /500/.test(p)));
  assert.ok(verifyAi({ ...good, deadline: '2026-12-25' }, text, ['Admission']).length > 0);
  assert.ok(verifyAi({ ...good, category: 'Gossip' }, text, ['Admission']).length > 0);
  assert.deepEqual(verifyAi({ relevant: false }, text, ['Admission']), ['not relevant']);
});
test('pipeline adds verified items, skips known urls, and keeps the feed valid', async () => {
  const feed = editorialFixture();
  const pages = { 'https://uni.example/': listing, 'https://uni.example/notice/1': page };
  const fetchText = async url => { if (!pages[url]) throw new Error('404'); return pages[url]; };
  const provider = { name: 'fake', async summarize({ title }) { return { relevant: true, title, summary: 'আবেদন ১০ ডিসেম্বর ২০২৬ পর্যন্ত চলবে। আবেদন ফি ৩৫০ টাকা।', category: 'Admission', deadline: '2026-12-10' }; } };
  const config = { maxNewPerRun: 5, keywords: ['ভর্তি'], sources: [{ id: 'uni', name: 'Example University', url: 'https://uni.example/' }, { id: 'down', name: 'Down', url: 'https://down.example/' }] };
  const before = feed.notices.length;
  const first = await runPipeline({ feed, config, fetchText, provider });
  assert.equal(first.added, 1); assert.equal(first.feed.notices.length, before + 1); assert.equal(first.stats.failed, 1);
  const item = first.feed.notices.find(n => n.ai);
  assert.equal(item.deadline, '2026-12-10'); assert.equal(item.url, 'https://uni.example/notice/1');
  const second = await runPipeline({ feed: first.feed, config, fetchText, provider });
  assert.equal(second.added, 0);
});
test('hallucinating provider output is rejected, not published', async () => {
  const feed = editorialFixture();
  const fetchText = async url => (url.endsWith('/1') ? page : listing);
  const provider = { name: 'liar', async summarize({ title }) { return { relevant: true, title, summary: 'আবেদন ফি ৯৯৯ টাকা এবং শেষ তারিখ ৫ জানুয়ারি ২০২৭।', category: 'Admission', deadline: '2027-01-05' }; } };
  const out = await runPipeline({ feed, config: { keywords: ['ভর্তি'], sources: [{ id: 'uni', name: 'U', url: 'https://uni.example/' }] }, fetchText, provider });
  assert.equal(out.added, 0); assert.equal(out.stats.rejected, 1);
});
test('mock provider works offline and mergeFeed trims oldest AI items first', async () => {
  const p = makeProvider('mock');
  const r = await p.summarize({ title: 'T', text: 'এটি একটি দীর্ঘ বাক্য যা পরীক্ষা করার জন্য। আরেকটি দীর্ঘ বাক্য এখানে আছে।' });
  assert.equal(r.relevant, true);
  const feed = editorialFixture();
  const many = Array.from({ length: 90 }, (_, i) => ({ id: `ai-${i}`, category: 'Admission', title: 'T' + i, summary: 'summary text ' + i, publishedAt: '2026-01-01', source: 's', url: `https://x.example/${i}`, ai: true }));
  const { feed: merged } = mergeFeed(feed, many);
  assert.equal(merged.notices.length, 80);
  assert.ok(feed.notices.every(n => merged.notices.some(m => m.id === n.id)));
});
