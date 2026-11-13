const dashboardSections = [
  ['student-overview', 'এক নজরে'], ['student-today', 'আজকের করণীয়'],
  ['student-timeline', 'সামনের তারিখ ও পরীক্ষা'], ['student-applications', 'প্রতিষ্ঠান ও অগ্রগতি'],
  ['student-eligibility', 'আমার যোগ্যতা'], ['student-changes', 'পরিবর্তন ও রিমাইন্ডার'],
  ['student-guide', 'গাইড ও অফিসিয়াল লিংক'],
];

function dashboardMoment(value, endOfDay = false) {
  if (!value) return NaN;
  return Date.parse(value.length === 10 ? value + (endOfDay ? 'T23:59:59.999+06:00' : 'T00:00:00+06:00') : value);
}

function dashboardTasks(entries, now) {
  const fortnight = now + 14 * 86400000;
  const actions = [], upcoming = [], exams = [];
  let closing = 0;
  for (const { item, stage } of entries) {
    const start = dashboardMoment(item.start);
    const end = dashboardMoment(item.end, true);
    const admit = dashboardMoment(item.admit);
    const exam = dashboardMoment(item.exam, true);
    const pending = stage === 'shortlist' || stage === 'applied';
    if (pending && end >= now) {
      if (end <= fortnight) closing++;
      if (stage === 'applied' || start <= now) {
        actions.push({ item, key: 'end', at: end, label: stage === 'applied' ? 'ফি জমার সময় ও status দেখুন' : 'আবেদনের প্রস্তুতি নিন' });
      } else if (start <= fortnight) {
        upcoming.push({ item, key: 'start', at: start, label: 'আবেদন খুলবে' });
      }
      upcoming.push({ item, key: 'end', at: end, label: 'আবেদনের শেষ দিন' });
    }
    if (stage === 'paid' && admit <= now && (Number.isNaN(exam) || exam >= now)) {
      actions.push({ item, key: 'admit', at: admit, label: 'প্রবেশপত্র দেখুন' });
    }
    if (stage === 'paid' && admit > now) upcoming.push({ item, key: 'admit', at: admit, label: 'প্রবেশপত্র পাওয়া যাবে' });
    if (stage !== 'exam' && exam >= now) exams.push({ item, key: 'exam', at: dashboardMoment(item.exam), label: 'ভর্তি পরীক্ষা' });
  }
  const ordered = list => list.sort((a, b) => a.at - b.at);
  return { actions: ordered(actions), upcoming: ordered(upcoming), exams: ordered(exams),
    closing };
}

function studentDashboard(data, entries, now) {
  const { actions, upcoming, exams, closing } = dashboardTasks(entries, now);
  const count = n => new Intl.NumberFormat('bn-BD').format(n);
  const metrics = [
    ['Shortlisted', entries.length], ['এখন করণীয়', actions.length],
    ['১৪ দিনের মধ্যে deadline', closing], ['ফি সম্পন্ন', entries.filter(plan => ['paid','admit','exam'].includes(plan.stage)).length],
  ];
  const list = (events, empty) => events.length ? '<ol class="student-events">' + events.map(({ item, key, label }) =>
    `<li><div><strong>${esc(item.institution)} · ${esc(item.unit)}</strong><span>${esc(label)}</span></div><time datetime="${esc(item[key])}">${esc(admissionDateLabel(item[key]))}</time>
    <a href="${esc(item.apply)}" target="_blank" rel="noopener noreferrer">অফিসিয়াল পোর্টাল</a></li>`).join('') + '</ol>' : `<p class="muted">${empty}</p>`;
  const section = (index, content) => {
    const [id, label] = dashboardSections[index];
    return `<section id="${id}" class="student-section stack" aria-labelledby="${id}-title"><h2 id="${id}-title">${label}</h2>${content}</section>`;
  };
  const changes = entries.flatMap(({ item }) => item.history.map(change => ({ item, change })))
    .sort((a, b) => b.change.created - a.change.created);
  return `<div class="container student-dash">
    <aside class="student-aside"><button class="btn btn--ghost" id="studentMenu" aria-expanded="false" aria-controls="studentNav" type="button">Dashboard sections</button>
    <nav id="studentNav" aria-label="Dashboard sections">${dashboardSections.map(([id,label], i) => `<a href="#${id}"${i === 0 ? ' aria-current="location"' : ''}>${label}</a>`).join('')}</nav></aside>
    <div class="stack student-main">
    ${section(0, `<div class="student-metrics">${metrics.map(([label,value]) => `<div class="card"><strong>${count(value)}</strong><span>${label}</span></div>`).join('')}</div>
      <div class="card form"><h3>সবচেয়ে কাছের পরীক্ষা</h3>${list(exams.slice(0, 1), 'Shortlist-এ সামনের কোনো পরীক্ষা নেই।')}
      <div class="actions"><a class="btn btn--primary btn--sm" href="/admissions" data-link>ক্যালেন্ডার থেকে যোগ করুন</a></div></div>`)}
    ${section(1, `<div class="card form">${list(actions, 'Shortlist-এ এখন কোনো আবেদন বা প্রবেশপত্রের কাজ নেই।')}</div>`)}
    ${section(2, `<div class="card form"><h3>আবেদন ও প্রবেশপত্র</h3>${list(upcoming, 'সামনে কোনো সময়সূচি পাওয়া যায়নি।')}</div>
      <div class="card form"><h3>পরীক্ষার ক্রম</h3>${list(exams, 'Shortlist-এ সামনের কোনো পরীক্ষা নেই।')}</div>`)}
    ${section(3, entries.length ? `<div class="card form"><label>প্রতিষ্ঠান বা ইউনিট খুঁজুন<input type="search" id="studentSearch"></label>
      <label>অগ্রগতি অনুযায়ী দেখুন<select id="studentStage"><option value="">সব ধাপ</option>${Object.entries(admissionStages).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
      <p class="muted" id="studentFilterEmpty" hidden>এই filter-এ কোনো আবেদন পাওয়া যায়নি।</p></div>
      <div class="stack">${entries.map(({ item, stage }) => `<div class="stack" data-student-entry="${esc(item.id)}">${admissionCard(item, { tracked: true, heading: 'h3' })}
      <div class="card form"><label>অগ্রগতি · ${esc(item.institution)}<select data-stage="${esc(item.id)}">${Object.entries(admissionStages).map(([key,label]) =>
        `<option value="${key}"${key === stage ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <button class="btn btn--ghost btn--sm" type="button" data-remove-plan="${esc(item.id)}">Shortlist থেকে সরান</button></div></div>`).join('')}</div>`
      : `<div class="card form"><p>আপনার shortlist খালি।</p><a href="/admissions" data-link>ভর্তি ক্যালেন্ডার থেকে প্রতিষ্ঠান যোগ করুন</a></div>`)}
    ${section(4, `<div class="card form">${admissionEligibilityForm()}<div id="studentEligibilityResults" aria-live="polite"></div></div>`)}
    ${section(5, `<div class="card form"><h3>Shortlist-এর পরিবর্তন</h3>${changes.length ? '<ul>' + changes.map(({ item, change }) =>
      `<li><strong>${esc(item.institution)}</strong> · ${esc(admissionDateLabel(new Date(change.created).toISOString()))} · ${esc(change.evidence)}
        ${Object.entries(admissionDates).filter(([key]) => change.before[key] !== change.after[key]).map(([key,label]) =>
          `<br>${esc(label + ': ' + admissionDateLabel(change.before[key]) + ' → ' + admissionDateLabel(change.after[key]))}`).join('')}</li>`).join('') + '</ul>' : '<p class="muted">এখনো কোনো প্রকাশিত পরিবর্তন নেই।</p>'}</div>
      <div class="card form"><h3>Email reminders</h3><p class="muted">Shortlist ও Applied stage-এর জন্য deadline-এর ৭ দিন ও ২৪ ঘণ্টা আগে, এবং সময় বদলালে email।</p>
      ${data.reminderAvailable || data.optedIn ? `<button class="btn btn--ghost" id="admissionReminders" type="button">${data.optedIn ? 'Email বন্ধ করুন' : 'Email চালু করুন'}</button>` : '<p class="small">Email delivery এখনো চালু হয়নি।</p>'}</div>`)}
    ${section(6, `<div class="card form"><h3>আবেদন ও বিষয় বাছাই</h3><ol><li>মূল circular থেকে unit, যোগ্যতা ও ফি মিলিয়ে নিন।</li><li>Official portal-এ আবেদন করে receipt সংরক্ষণ করুন।</li><li>বিষয় বাছাইয়ের আগে বিশ্ববিদ্যালয়ের syllabus, prerequisite, খরচ ও যাতায়াত তুলনা করুন।</li><li>প্রবেশপত্র ও পরীক্ষার কেন্দ্র official portal-এ আবার মিলিয়ে নিন।</li></ol>
      <a href="/study" data-link>Study &amp; Guidelines</a></div>
      <div class="card form"><h3>অফিসিয়াল লিংক</h3>${data.items.map(item => `<a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">${esc(item.institution)} · ${esc(item.unit)}</a>`).join('')}</div>`)}
    </div></div>`;
}

function bindStudentDashboard(view, entries) {
  const form = $('#eligibilityForm', view);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const out = $('#studentEligibilityResults', view);
    const profile = Object.fromEntries(new FormData(form));
    out.innerHTML = entries.length ? '<ul>' + entries.map(({ item }) => {
      const result = admissionEligibility(item.rules, profile);
      return `<li><strong>${esc(item.institution)} · ${esc(item.unit)}</strong><br>${esc(result.status)} · ${esc(result.reasons.join(', '))}
        ${item.rules?.note || item.eligibilityNote ? '<br>' + esc(item.rules?.note || item.eligibilityNote) : ''}
        <a href="${esc(item.rules?.source || item.source)}" target="_blank" rel="noopener noreferrer">মূল উৎস</a></li>`;
    }).join('') + '</ul>' : '<p>যোগ্যতা দেখতে আগে ক্যালেন্ডার থেকে প্রতিষ্ঠান shortlist করুন।</p>';
  });
  const search = $('#studentSearch', view);
  const stage = $('#studentStage', view);
  function filter() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const node of $$('[data-student-entry]', view)) {
      const entry = entries.find(plan => plan.item.id === node.dataset.studentEntry);
      node.hidden = Boolean((stage.value && entry.stage !== stage.value) || ![entry.item.institution, entry.item.unit, entry.item.id].join(' ').toLowerCase().includes(query));
      if (!node.hidden) shown++;
    }
    $('#studentFilterEmpty', view).hidden = shown > 0;
  }
  search?.addEventListener('input', filter);
  stage?.addEventListener('change', filter);
  const menu = $('#studentMenu', view);
  const nav = $('#studentNav', view);
  const links = $$('a', nav);
  const sections = $$('.student-section', view);
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true')));
  links.forEach(link => link.addEventListener('click', () => menu.setAttribute('aria-expanded', 'false')));
  const update = () => {
    const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    const active = atBottom ? sections.at(-1) : sections.findLast(section => section.getBoundingClientRect().top <= 140) || sections[0];
    links.forEach(link => {
      if (link.hash === '#' + active.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  view.studentNavigation?.abort();
  view.studentNavigation = new AbortController();
  addEventListener('scroll', update, { passive: true, signal: view.studentNavigation.signal });
  update();
  const deepLink = sections.find(section => location.hash === '#' + section.id);
  if (deepLink) requestAnimationFrame(() => deepLink.scrollIntoView());
}
