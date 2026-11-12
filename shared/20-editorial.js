// Editorial feed (data/editorial.json) validation. Used by the Worker, the hourly workflow and tests.

export const editorialLimits = { notices: 80, study: 60, title: 160, summary: 800, source: 100, digest: 1200 };
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,89}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function httpsHref(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length > 600) return null;
  let parsed;
  try { parsed = new URL(text); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return parsed.href;
}

function textProblem(value, max, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= min && text.length <= max ? '' : `must be ${min}-${max} characters`;
}

// Returns a list of human-readable problems. An empty list means the document is valid.
export function editorialProblems(data, categories = { notices: ['Admission', 'Exam', 'Holiday', 'Official', 'Breaking'], study: ['Trend', 'Tip', 'Video', 'Website'] }) {
  const problems = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['document must be a JSON object'];
  if (data.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (typeof data.checkedAt !== 'string' || !Number.isFinite(Date.parse(data.checkedAt))) problems.push('checkedAt must be an ISO date-time');
  if (!Array.isArray(data.notices)) problems.push('notices must be an array');
  if (!Array.isArray(data.study)) problems.push('study must be an array');
  if (problems.length) return problems;
  if (data.notices.length > editorialLimits.notices) problems.push(`more than ${editorialLimits.notices} notices`);
  if (data.study.length > editorialLimits.study) problems.push(`more than ${editorialLimits.study} study items`);
  if (data.digest !== undefined) {
    const digest = data.digest;
    if (!digest || typeof digest !== 'object' || textProblem(digest.text, editorialLimits.digest)) problems.push('digest.text must be 1-1200 characters');
    else if (!Number.isFinite(Date.parse(digest.generatedAt))) problems.push('digest.generatedAt must be an ISO date-time');
  }
  const check = (entries, kind, allowed, needsSource) => {
    const ids = new Set();
    entries.forEach((entry, index) => {
      const label = `${kind}[${index}]${entry?.id ? ' (' + entry.id + ')' : ''}`;
      if (!entry || typeof entry !== 'object') { problems.push(`${label}: must be an object`); return; }
      if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) problems.push(`${label}: id must be lowercase hyphenated`);
      else if (ids.has(entry.id)) problems.push(`${label}: duplicate id`);
      else ids.add(entry.id);
      if (!allowed.includes(entry.category)) problems.push(`${label}: category must be one of ${allowed.join(', ')}`);
      if (!isRealDate(entry.publishedAt)) problems.push(`${label}: publishedAt must be a real YYYY-MM-DD date`);
      for (const [field, max] of [['title', editorialLimits.title], ['summary', editorialLimits.summary], ['source', editorialLimits.source]]) {
        const problem = textProblem(entry[field], max);
        if (problem) problems.push(`${label}: ${field} ${problem}`);
      }
      const href = httpsHref(entry.url);
      if (href === null) problems.push(`${label}: url must be a valid HTTPS link`);
      else if (needsSource && !href) problems.push(`${label}: notices need an HTTPS source url`);
      if (entry.deadline !== undefined && entry.deadline !== '' && !isRealDate(entry.deadline)) problems.push(`${label}: deadline must be a real YYYY-MM-DD date`);
      if (entry.ai !== undefined && typeof entry.ai !== 'boolean') problems.push(`${label}: ai must be true or false`);
    });
  };
  check(data.notices, 'notices', categories.notices, true);
  check(data.study, 'study', categories.study, false);
  return problems;
}

// Throws on an invalid document; otherwise returns the normalized records the site renders.
// `infer` is an optional (text) => 'YYYY-MM-DD' used for notices without an explicit deadline.
export function parseEditorial(data, infer) {
  const problems = editorialProblems(data);
  if (problems.length) throw new Error('Invalid editorial document: ' + problems.slice(0, 3).join('; '));
  const normalize = (entries, withDeadline) => entries.map(entry => {
    const explicit = entry.deadline || '';
    const inferred = withDeadline && !explicit && infer ? infer(entry.summary + ' ' + entry.title) : '';
    return {
      id: entry.id, category: entry.category, title: entry.title.trim(), summary: entry.summary.trim(),
      source: entry.source.trim(), url: httpsHref(entry.url) || '', created: Date.parse(entry.publishedAt + 'T00:00:00+06:00'),
      origin: 'Editorial', deadline: explicit || inferred, deadlineInferred: Boolean(inferred), ai: entry.ai === true,
    };
  });
  return {
    checkedAt: data.checkedAt,
    notice: normalize(data.notices, true),
    study: normalize(data.study, false),
    digest: data.digest ? { text: data.digest.text.trim(), generatedAt: data.digest.generatedAt } : null,
  };
}
