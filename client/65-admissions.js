function paintAdmissionDeadlines(view) {
  const now = Date.now();
  for (const node of $$('[data-admission-deadline]', view)) {
    const minutes = Math.ceil((Date.parse(node.dataset.admissionDeadline) - now) / 60000);
    if (minutes <= 0) { node.textContent = 'আবেদনের সময় শেষ'; continue; }
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes % 1440 / 60);
    const formatter = new Intl.NumberFormat('bn-BD');
    node.textContent = days ? formatter.format(days) + ' দিন ' + formatter.format(hours) + ' ঘণ্টা বাকি'
      : hours ? formatter.format(hours) + ' ঘণ্টা ' + formatter.format(minutes % 60) + ' মিনিট বাকি'
        : formatter.format(minutes) + ' মিনিট বাকি';
  }
}

function bindAdmissionCalendar(view, items) {
  $('#eligibilityForm', view).addEventListener('submit', event => {
    event.preventDefault();
    const profile = Object.fromEntries(new FormData(event.target));
    for (const item of items) {
      const result = admissionEligibility(item.rules, profile);
      const out = view.querySelector('[data-admission-card="' + item.id + '"] [data-admission-result]');
      out.innerHTML = `<strong>${esc(result.status)}</strong> · ${esc(result.reasons.join(', '))}${item.rules?.note || item.eligibilityNote ? '<br>' + esc(item.rules?.note || item.eligibilityNote) : ''}${item.rules?.source ? ` <a href="${esc(item.rules.source)}" target="_blank" rel="noopener noreferrer">যোগ্যতার উৎস</a>` : ''}`;
    }
  });
  for (const button of $$('[data-shortlist]', view)) button.addEventListener('click', () => busy(button, async () => {
    if (!S.session.profile) { navigate('/account'); return; }
    const data = await api('/admission-plans');
    if (!data.plans.some(plan => plan.circular === button.dataset.shortlist)) {
      await api('/admission-plans/' + button.dataset.shortlist, { method: 'PUT', body: { stage: 'shortlist' } });
    }
    navigate('/applications');
  }));
}

async function renderAdmissions(view) {
  const items = await api('/admissions');
  if (cleanPath() !== '/admissions') return;
  view.innerHTML = pageAdmissions(items);
  bindAdmissionCalendar(view, items);
  paintAdmissionDeadlines(view);
}

async function renderApplications(view) {
  const heading = pageHead('Student dashboard', 'My Applications', 'নিজের shortlist, আবেদন ও পরীক্ষার অগ্রগতি দেখুন।');
  if (!S.session.profile) {
    view.innerHTML = heading + '<section class="container"><a class="btn btn--primary" href="/account" data-link>Sign in or create a profile</a></section>';
    return;
  }
  const data = await api('/admission-plans');
  if (cleanPath() !== '/applications') return;
  const entries = data.plans.map(plan => ({ ...plan, item: data.items.find(item => item.id === plan.circular) }))
    .filter(plan => plan.item).sort((a, b) => (a.item.end || 'z').localeCompare(b.item.end || 'z'));
  view.innerHTML = heading + `<section class="container stack">
    <div class="card form"><h2>Email reminders</h2><p class="muted">Shortlist ও Applied আবেদনের জন্য সময়ের ৭ দিন ও ২৪ ঘণ্টা আগে এবং deadline বদলালে email।</p>
    ${data.reminderAvailable || data.optedIn ? `<button class="btn btn--ghost" id="admissionReminders" type="button">${data.optedIn ? 'Turn off reminders' : 'Enable email reminders'}</button>` : '<p class="small">Email delivery এখনো চালু হয়নি।</p>'}</div>
    <div class="actions"><a class="btn btn--primary" href="/admissions" data-link>ভর্তি ক্যালেন্ডার</a></div>
    <div class="grid grid-2">${entries.map(plan => `<div class="stack">${admissionCard(plan.item, { tracked: true })}
      <div class="card form"><label>Application stage<select data-stage="${esc(plan.circular)}">${Object.entries(admissionStages).map(([key, label]) =>
        `<option value="${key}"${key === plan.stage ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <button class="btn btn--ghost" type="button" data-remove-plan="${esc(plan.circular)}">Remove from shortlist</button></div></div>`).join('')}</div>
    ${entries.length ? '' : emptyState('আপনার shortlist খালি। ক্যালেন্ডার থেকে একটি আবেদন যোগ করুন।')}</section>`;
  paintAdmissionDeadlines(view);
  const reminder = $('#admissionReminders', view);
  reminder?.addEventListener('click', () => busy(reminder, async () => {
    await api('/admission-reminders', { method: 'PUT', body: { enabled: !data.optedIn } });
    await renderApplications(view);
  }));
  for (const select of $$('[data-stage]', view)) select.addEventListener('change', () => busy(select, async () => {
    const previous = entries.find(plan => plan.circular === select.dataset.stage).stage;
    try {
      await api('/admission-plans/' + select.dataset.stage, { method: 'PUT', body: { stage: select.value } });
      await renderApplications(view);
    } catch (error) { select.value = previous; throw error; }
  }));
  for (const button of $$('[data-remove-plan]', view)) button.addEventListener('click', () => busy(button, async () => {
    await api('/admission-plans/' + button.dataset.removePlan, { method: 'DELETE' });
    await renderApplications(view);
  }));
}

async function renderAdmissionReview(main) {
  const { items, snapshots } = await api('/admin/admissions');
  if (cleanPath() !== '/admin' || new URLSearchParams(location.search).get('tab') !== 'admissions') return;
  main.innerHTML = `<div class="stack"><button class="btn btn--ghost" id="syncAdmission" type="button">Sync GitHub observations</button>
    ${items.map(item => {
      const source = snapshots.find(row => row.circular === item.id);
      const pending = source && source.hash !== source.reviewed_hash;
      return `<form class="card form" data-admission-review="${item.id}"><h2>${esc(item.institution)} · ${esc(item.unit)}</h2>
        <p class="muted">${pending ? 'Source change needs review' : source ? 'Latest source reviewed' : 'Waiting for first source snapshot'}</p>
        <a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">Open official circular</a>
        ${pending ? `<details><summary>Source excerpt</summary><p>${esc(source.excerpt)}</p></details>` : ''}
        <div class="grid grid-2">${Object.entries(admissionDates).map(([key,label]) =>
          `<label>${label}<input name="${key}" value="${esc(item[key] || '')}" placeholder="YYYY-MM-DD or YYYY-MM-DDTHH:mm+06:00"></label>`).join('')}</div>
        <label>Source reference and review note<textarea name="evidence" minlength="12" maxlength="650" required>${esc(item.evidence)}</textarea></label>
        <button class="btn btn--primary" type="submit">Approve reviewed schedule</button></form>`;
    }).join('')}</div>`;
  const sync = $('#syncAdmission', main);
  sync.addEventListener('click', () => busy(sync, async () => {
    await api('/admin/admission-scan', { method: 'POST' });
    await renderAdmissionReview(main);
  }));
  for (const form of $$('[data-admission-review]', main)) form.addEventListener('submit', event => {
    event.preventDefault();
    const item = items.find(row => row.id === form.dataset.admissionReview);
    const source = snapshots.find(row => row.circular === item.id);
    const data = Object.fromEntries(new FormData(form));
    busy(event.submitter, async () => {
      await api('/admin/admissions/' + item.id, { method: 'POST', body: { ...data, revision: item.revision, hash: source?.hash } });
      await renderAdmissionReview(main);
    });
  });
}
