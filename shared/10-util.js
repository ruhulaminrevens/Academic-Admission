// Shared by the Worker (SSR) and the browser bundle, and importable from Node scripts/tests.
// Rule: ES-module syntax with `export` only in front of declarations. The build strips `export`.

export const noticeTypes = ['Admission', 'Exam', 'Holiday', 'Official', 'Breaking'];
export const studyTypes = ['Trend', 'Tip', 'Video', 'Website'];
export const topics = ['Admission', 'Study', 'Question', 'General'];
export const reportReasons = ['spam', 'abuse', 'misleading', 'other'];
export const roles = ['member', 'moderator', 'admin', 'superadmin'];
export const roleRank = { member: 0, moderator: 1, admin: 2, superadmin: 3 };
export const roleLabel = { member: 'Member', moderator: 'Moderator', admin: 'Admin', superadmin: 'Super Admin' };

export const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
export const SITE_NAME = 'Academic Admission';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function truncate(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bn = value => String(value).replace(/\d/g, digit => BN_DIGITS[digit]);
export const asciiDigits = value => String(value).replace(/[০-৯]/g, digit => BN_DIGITS.indexOf(digit));

const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
export const fmtDate = ms => dateFormat.format(ms);
export const fmtDateTime = ms => dateTimeFormat.format(ms);

export function dhakaDay(ms = Date.now()) {
  return new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

// Whole calendar days from "today in Dhaka" to a YYYY-MM-DD deadline. 0 = today, <0 = passed.
export function daysUntil(deadline, now = Date.now()) {
  const target = Date.parse(deadline + 'T00:00:00Z');
  const today = Date.parse(dhakaDay(now) + 'T00:00:00Z');
  return Math.round((target - today) / 86400000);
}

export function timeAgo(ms, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 45) return 'এইমাত্র';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return bn(minutes) + ' মিনিট আগে';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return bn(hours) + ' ঘণ্টা আগে';
  const days = Math.round(hours / 24);
  return days < 45 ? bn(days) + ' দিন আগে' : fmtDate(ms);
}

export function deadlineInfo(deadline, now = Date.now()) {
  if (!deadline) return null;
  const days = daysUntil(deadline, now);
  if (days < 0) return { days, tone: 'past', label: 'আবেদন শেষ' };
  if (days === 0) return { days, tone: 'hot', label: 'আজই শেষ দিন' };
  if (days <= 3) return { days, tone: 'hot', label: bn(days) + ' দিন বাকি' };
  if (days <= 10) return { days, tone: 'soon', label: bn(days) + ' দিন বাকি' };
  return { days, tone: 'ok', label: bn(days) + ' দিন বাকি' };
}

export const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const isUuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(value));

const MONTHS = {
  'জানুয়ারি': 1, 'ফেব্রুয়ারি': 2, 'মার্চ': 3, 'এপ্রিল': 4, 'মে': 5, 'জুন': 6, 'জুলাই': 7, 'আগস্ট': 8,
  'সেপ্টেম্বর': 9, 'অক্টোবর': 10, 'নভেম্বর': 11, 'ডিসেম্বর': 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const dayFirst = new RegExp(`(\\d{1,2})\\s*(${monthNames})[,\\s]*(\\d{4})`, 'giu');
const monthFirst = new RegExp(`(${monthNames})\\s+(\\d{1,2})[,\\s]+(\\d{4})`, 'giu');
const cueAfter = /পর্যন্ত|\buntil\b|\btill\b/i;
const cueBefore = /শেষ\s*(তারিখ|সময়|দিন)|deadline|last\s+date|due\s+date/i;

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Conservative heuristic for notices that have no explicit `deadline`: pick the first date that is
// directly followed by "পর্যন্ত"/"until" or preceded by "শেষ তারিখ"/"deadline". Returns YYYY-MM-DD or ''.
export function inferDeadline(text) {
  const source = asciiDigits(String(text ?? ''));
  const found = [];
  for (const match of source.matchAll(dayFirst)) {
    found.push({ index: match.index, end: match.index + match[0].length, day: +match[1], month: MONTHS[match[2].toLowerCase()], year: +match[3] });
  }
  for (const match of source.matchAll(monthFirst)) {
    found.push({ index: match.index, end: match.index + match[0].length, day: +match[2], month: MONTHS[match[1].toLowerCase()], year: +match[3] });
  }
  found.sort((a, b) => a.index - b.index);
  for (let i = 0; i < found.length; i++) {
    const hit = found[i];
    if (!hit.month || !validDate(hit.year, hit.month, hit.day)) continue;
    const limit = Math.min(found[i + 1]?.index ?? Infinity, hit.end + 60);
    const after = source.slice(hit.end, limit).split(/[।.]/)[0];
    const before = source.slice(Math.max(0, hit.index - 30), hit.index);
    if (cueAfter.test(after) || cueBefore.test(before)) {
      return `${hit.year}-${String(hit.month).padStart(2, '0')}-${String(hit.day).padStart(2, '0')}`;
    }
  }
  return '';
}

export function linkify(text) {
  return esc(text).replace(/https:\/\/[^\s<]+/g, raw => {
    const trail = (raw.match(/[.,;:!?)]+$/) || [''])[0];
    const url = trail ? raw.slice(0, -trail.length) : raw;
    return `<a href="${url}" target="_blank" rel="nofollow ugc noopener noreferrer">${url}</a>${trail}`;
  });
}

export const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
