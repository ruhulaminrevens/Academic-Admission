import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { htmlToText } from './lib/editorial-core.mjs';

const sources = JSON.parse(await readFile('data/admissions.json'));
const file = 'data/admission-observations.json';
const previous = new Map(JSON.parse(await readFile(file)).map(item => [item.id, item]));
let successes = 0;
for (const { id, source } of sources) {
  try {
    const res = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'AcademicAdmissionBot/2.0 (+https://github.com/ruhulaminrevens/Academic-Admission)' } });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > 12_000_000) throw new Error('Document is too large');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
    const parsed = pdf ? spawnSync('pdftotext', ['-layout', '-', '-'], { input: bytes, encoding: 'utf8', maxBuffer: 2_000_000, timeout: 12000 }) : null;
    const normalized = pdf ? (parsed.stdout || '').replace(/\s+/g, ' ').trim()
      : htmlToText(bytes.toString('utf8').replace(/<(nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ''), 80000)
          .replace(/সময় শুরু হয়েছে|সময় শুরু হয়েছে|সময় শেষ হয়েছে|সময় শেষ হয়েছে/g, '');
    if (!pdf && normalized.length < 80) throw new Error('Source text is incomplete');
    const hash = createHash('sha256').update(normalized.length >= 80 ? normalized : bytes).digest('hex');
    const position = normalized.search(/গুরুত্বপূর্ণ তারিখ|সময়সূচী|সময়সূচি|ভর্তি পরীক্ষার তারিখ|application deadline/i);
    const excerpt = normalized.length >= 80 ? normalized.slice(Math.max(0, position), Math.max(0, position) + 3500)
      : 'স্ক্যান করা PDF বদলেছে। মূল PDF খুলে সময়সূচি যাচাই করুন।';
    if (previous.get(id)?.hash !== hash) previous.set(id, { id, hash, excerpt, checked: Date.now() });
    successes++;
  } catch (error) { console.warn(id, error.message); }
}
if (!successes) throw new Error('No admission source was fetched');
await writeFile(file, JSON.stringify([...previous.values()], null, 2) + '\n');
