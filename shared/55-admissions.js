export const admissionStages = {
  shortlist: 'Shortlisted', applied: 'Applied', paid: 'Fee paid',
  admit: 'Admit card ready', exam: 'Exam completed',
};
export const admissionSubjects = { math: 'গণিত', physics: 'পদার্থবিজ্ঞান', chemistry: 'রসায়ন', english: 'ইংরেজি', biology: 'জীববিজ্ঞান' };
export const admissionDates = { start: 'আবেদন শুরু', end: 'আবেদন শেষ', admit: 'প্রবেশপত্র শুরু', exam: 'ভর্তি পরীক্ষা' };

export function admissionEligibility(rules, profile) {
  const missing = [], unmet = [];
  if (!rules || profile.board !== 'bd') return { status: 'More information needed', reasons: ['এই আবেদনকারীর জন্য সম্পূর্ণ যাচাইকৃত নিয়ম পাওয়া যায়নি।'] };
  const check = (value, label, test) => {
    if (value === '' || value == null) missing.push(label);
    else if (!test(value)) unmet.push(label);
  };
  if (rules.byGroup && !Object.hasOwn(rules.byGroup, profile.group)) missing.push('শিক্ষা বিভাগ');
  rules = { ...rules, ...rules.byGroup?.[profile.group] };
  if (rules.groups) check(profile.group, 'শিক্ষা বিভাগ', v => rules.groups.includes(v));
  for (const [key, label] of [['ssc', 'SSC'], ['hsc', 'HSC']]) {
    if (rules[key + 'Years']) check(profile[key + 'Year'], label + ' পাশের বছর', v => rules[key + 'Years'].includes(Number(v)));
    if (rules[key] != null) check(profile[key], label + ' GPA', v => Number(v) >= rules[key]);
  }
  if (rules.total != null) check(profile.ssc !== '' && profile.hsc !== '' && profile.ssc != null && profile.hsc != null ? (Math.round(Number(profile.ssc) * 100) + Math.round(Number(profile.hsc) * 100)) / 100 : '', 'SSC + HSC GPA', v => v >= rules.total);
  for (const [key, min] of Object.entries(rules.subjects || {})) check(profile[key], admissionSubjects[key], v => Number(v) >= min);
  if (unmet.length) return { status: 'Not eligible', reasons: unmet };
  if (!rules.complete) missing.push('অফিসিয়াল নির্দেশিকার অতিরিক্ত শর্ত');
  if (missing.length) return { status: 'More information needed', reasons: missing };
  return { status: 'Eligible', reasons: ['প্রকাশিত প্রাথমিক আবেদন শর্ত পূরণ হয়েছে।'] };
}

export function admissionDateLabel(value) {
  if (!value) return 'প্রকাশিত হয়নি';
  const precise = value.length > 10;
  return new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', ...(precise ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Dhaka' }).format(new Date(precise ? value : value + 'T12:00:00+06:00'));
}

export function admissionCard(item, { tracked = false } = {}) {
  return `<article class="card form admission-card" data-admission-card="${esc(item.id)}">
    <h2>${esc(item.institution)}</h2><p class="muted">${esc(item.unit)} · ${esc(item.session)}</p>
    <dl class="admission-dates">${Object.entries(admissionDates).map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(admissionDateLabel(item[key]))}</dd></div>`).join('')}</dl>
    <p class="muted small">${esc(item.evidence)}</p>
    ${item.end?.length > 10 ? `<p class="small"><strong data-admission-deadline="${esc(item.end)}">আবেদনের শেষ সময় ${esc(admissionDateLabel(item.end))}</strong></p>` : ''}
    <div class="actions"><a class="btn btn--primary btn--sm" href="${esc(item.apply)}" target="_blank" rel="noopener noreferrer">অফিসিয়াল পোর্টাল</a>
    <a class="btn btn--ghost btn--sm" href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">মূল বিজ্ঞপ্তি</a>
    ${tracked ? '' : `<button class="btn btn--ghost btn--sm" type="button" data-shortlist="${esc(item.id)}">Shortlist</button>`}</div>
    <div class="small" data-admission-result aria-live="polite"></div>
    ${item.history?.length ? `<details><summary>পরিবর্তনের তালিকা</summary><ul>${item.history.map(change => `<li>${esc(admissionDateLabel(new Date(change.created).toISOString()))} — ${esc(change.evidence)}<br>${Object.entries(admissionDates).filter(([key]) => change.before[key] !== change.after[key]).map(([key,label]) => esc(label + ': ' + admissionDateLabel(change.before[key]) + ' → ' + admissionDateLabel(change.after[key]))).join('<br>')}</li>`).join('')}</ul></details>` : ''}
  </article>`;
}

export function pageAdmissions(items) {
  return `${pageHead('Bangladesh · 2026–27', 'ভর্তি ক্যালেন্ডার', 'অফিসিয়াল সময়সূচি দেখুন, প্রাথমিক যোগ্যতা মিলিয়ে নিন ও নিজের আবেদন shortlist করুন। সময় বাংলাদেশ স্থানীয় সময়ে।')}
  <section class="container stack">
    <details class="card form"><summary>যোগ্যতা যাচাই</summary>
      <form id="eligibilityForm" class="form">
        <p class="muted">GPA ও subject grades এই browser-এই হিসাব হয়। বিভাগভেদে অতিরিক্ত শর্তের জন্য মূল নির্দেশিকা দেখুন।</p>
        <div class="grid grid-2">
        <label>পরীক্ষার ধরন<select name="board"><option value="bd">বাংলাদেশি SSC/HSC</option><option value="other">O/A Level বা অন্য সমমান</option></select></label>
        <label>শিক্ষা বিভাগ<select name="group"><option value="">বেছে নিন</option><option>Science</option><option>Arts</option><option>Commerce</option></select></label>
        ${['ssc', 'hsc'].map(key => `<label>${key.toUpperCase()} GPA<input type="number" name="${key}" min="0" max="5" step=".01"></label><label>${key.toUpperCase()} পাশের বছর<input type="number" name="${key}Year" min="1990" max="2100"></label>`).join('')}
        ${Object.entries(admissionSubjects).map(([key, label]) => `<label>${label} grade point<input type="number" name="${key}" min="0" max="5" step=".01"></label>`).join('')}
        </div>
        <button class="btn btn--primary" type="submit">যোগ্যতা দেখুন</button>
      </form>
    </details>
    <div class="actions"><a class="btn btn--ghost" href="/applications" data-link>My Applications</a></div>
    <div class="grid grid-2">${items.map(item => admissionCard(item)).join('')}</div>
  </section>`;
}
