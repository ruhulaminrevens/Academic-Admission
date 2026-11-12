// Loads the shared browser/Worker code into Node the same way the build concatenates it.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../../shared/', import.meta.url).pathname;
const code = readdirSync(dir).filter(name => name.endsWith('.js')).sort()
  .map(name => readFileSync(dir + name, 'utf8').replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '')).join('\n');
export const shared = new Function(`${code}\nreturn { editorialProblems, editorialLimits, isRealDate, httpsHref, inferDeadline, asciiDigits, slug, noticeTypes, studyTypes, dhakaDay };`)();
