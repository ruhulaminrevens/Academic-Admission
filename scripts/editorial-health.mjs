// Validates data/editorial.json and warns when the hourly run has gone stale.
// Usage: node scripts/editorial-health.mjs [--max-age-hours 3] [--no-age]
import { readFile } from 'node:fs/promises';
import { shared } from './lib/shared.mjs';
const args = process.argv.slice(2);
const maxAge = Number(args.includes('--max-age-hours') ? args[args.indexOf('--max-age-hours') + 1] : 3);
const data = JSON.parse(await readFile(new URL('../data/editorial.json', import.meta.url), 'utf8'));
const problems = shared.editorialProblems(data);
if (problems.length) { console.error('Invalid data/editorial.json:\n- ' + problems.join('\n- ')); process.exit(1); }
const age = (Date.now() - Date.parse(data.checkedAt)) / 3600000;
console.log(`OK — ${data.notices.length} notices, ${data.study.length} study items, checked ${age.toFixed(1)}h ago.`);
if (!args.includes('--no-age') && age > maxAge) { console.error(`Stale: last check was ${age.toFixed(1)}h ago (limit ${maxAge}h).`); process.exit(2); }
