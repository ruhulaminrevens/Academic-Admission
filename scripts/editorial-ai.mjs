// Hourly AI editorial run: check official sources, summarize NEW notices with an LLM, verify every number/date
// against the source text, validate the feed schema, write data/editorial.json and (optionally) report to the site.
// Usage: node scripts/editorial-ai.mjs [--dry] [--provider mock|openai|anthropic]
import { readFile, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { makeProvider } from './lib/providers.mjs';
import { runPipeline, httpFetchText } from './lib/editorial-core.mjs';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const providerName = args.includes('--provider') ? args[args.indexOf('--provider') + 1] : process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');

const started = Date.now();
const feedPath = join(root, 'data/editorial.json');
const feed = JSON.parse(await readFile(feedPath, 'utf8'));
const config = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));
const provider = makeProvider(providerName);
const notes = [];
let status = 'success', result;
try {
  result = await runPipeline({ feed, config, fetchText: httpFetchText, provider, log: line => { notes.push(line); console.log(line); } });
  if (result.stats.sources > 0 && result.stats.failed === result.stats.sources) status = 'failed';
  else if (result.stats.failed > 0 || result.stats.rejected > 0) status = 'partial';
  if (result.added === 0 && status === 'success') status = 'noop';
  if (status !== 'failed' && !dry) await writeFile(feedPath, JSON.stringify(result.feed, null, 2) + '\n');
} catch (error) {
  status = 'failed'; notes.push(error.message); console.error(error.message);
}
const summary = { status, added: result?.added ?? 0, updated: 0, removed: 0, sources: result?.stats.sources ?? 0, model: provider.name, started, finished: Date.now(),
  notes: `${result ? `${result.stats.candidates} candidates, ${result.stats.rejected} rejected. ` : ''}${notes.slice(-3).join(' | ')}`.slice(0, 380), commit: process.env.GITHUB_SHA || '' };
console.log(JSON.stringify(summary));

// Report to the site so the Super Admin AI tab shows each run (needs SITE_URL + AI_WEBHOOK_SECRET).
if (!dry && process.env.SITE_URL && process.env.AI_WEBHOOK_SECRET) {
  const body = JSON.stringify(summary), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.AI_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  try {
    const res = await fetch(new URL('/api/hooks/editorial-run', process.env.SITE_URL), { method: 'POST', headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature': signature }, body, signal: AbortSignal.timeout(15000) });
    console.log('webhook', res.status);
  } catch (error) { console.log('webhook failed:', error.message); }
}
if (status === 'failed') process.exitCode = 1;
