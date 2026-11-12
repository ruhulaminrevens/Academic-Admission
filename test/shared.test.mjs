import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShared, editorialFixture } from './helpers.mjs';

const S = loadShared(['inferDeadline', 'deadlineInfo', 'editorialProblems', 'parseEditorial', 'esc', 'slug', 'isUuid', 'linkify', 'truncate', 'httpsHref', 'jsonForHtml', 'noticeCard', 'pageNotFound']);

test('inferDeadline understands Bangla and English cues', () => {
  assert.equal(S.inferDeadline('আবেদন ১০ ডিসেম্বর ২০২৬ পর্যন্ত চলবে।'), '2026-12-10');
  assert.equal(S.inferDeadline('Applications accepted. Deadline: 5 January 2027'), '2027-01-05');
  assert.equal(S.inferDeadline('শেষ তারিখ ২০ নভেম্বর ২০২৬'), '2026-11-20');
});
test('inferDeadline stays quiet without a cue or on impossible dates', () => {
  assert.equal(S.inferDeadline('বিজ্ঞপ্তি প্রকাশিত হয়েছে ১২ নভেম্বর ২০২৬ তারিখে।'), '');
  assert.equal(S.inferDeadline('শেষ তারিখ ৩১ ফেব্রুয়ারি ২০২৬'), '');
  assert.equal(S.inferDeadline(''), '');
});
test('deadlineInfo tones', () => {
  const now = Date.parse('2026-11-12T06:00:00Z');
  assert.equal(S.deadlineInfo('2026-11-12', now).tone, 'hot');
  assert.equal(S.deadlineInfo('2026-11-18', now).tone, 'soon');
  assert.equal(S.deadlineInfo('2026-12-30', now).tone, 'ok');
  assert.equal(S.deadlineInfo('2026-11-01', now).tone, 'past');
  assert.equal(S.deadlineInfo('', now), null);
});
test('bundled editorial feed validates and parses', () => {
  const data = editorialFixture();
  assert.deepEqual(S.editorialProblems(data), []);
  const parsed = S.parseEditorial(data, S.inferDeadline);
  assert.ok(parsed.notice.length > 0 && parsed.study.length > 0);
  for (const item of parsed.notice) { assert.ok(item.id && item.title && item.url.startsWith('https://')); }
});
test('editorial validation rejects bad input', () => {
  const data = editorialFixture();
  data.notices[0].url = 'http://insecure.example';
  assert.ok(S.editorialProblems(data).length > 0);
});
test('escaping and rendering are XSS-safe', () => {
  assert.equal(S.esc('<img src=x onerror=alert(1)>"\''), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
  const html = S.noticeCard({ id: 'a', category: 'Admission', title: '<script>alert(1)</script>', summary: '"><b>', source: 'x', url: 'https://ok.example/', created: Date.now(), deadline: '', origin: 'Editorial' }, { now: Date.now() });
  assert.ok(!html.includes('<script>') && !html.includes('"><b>'));
  assert.ok(!S.linkify('javascript:alert(1)').includes('href'));
  assert.equal(S.jsonForHtml({ a: '</script><!--' }).includes('</script>'), false);
});
test('helpers', () => {
  assert.equal(S.slug('Hello World!'), 'hello-world');
  assert.ok(S.isUuid('00000000-0000-4000-8000-000000000001') && !S.isUuid('nope'));
  assert.equal(S.httpsHref('http://x.example'), null);
  assert.equal(S.httpsHref(''), '');
});
