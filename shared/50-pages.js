// Page-level HTML builders (public pages). Account and Admin are rendered by the client only.

export const faqItems = [
  ['Academic Admission কী?', 'বাংলাদেশের admission, পরীক্ষা, ছুটি ও শিক্ষা-সংক্রান্ত নোটিশ এক জায়গায় দেখার জন্য একটি platform। সাথে আছে study guideline, deadline countdown এবং শিক্ষার্থীদের community।'],
  ['নোটিশগুলো কোথা থেকে আসে?', 'প্রতিটি নোটিশের সাথে মূল সরকারি বা প্রতিষ্ঠানের লিংক থাকে। Editorial feed এবং admin-প্রকাশিত নোটিশ — দুটোই এখানে দেখানো হয়। সিদ্ধান্ত নেওয়ার আগে “Source” লিংকে গিয়ে মূল বিজ্ঞপ্তি যাচাই করুন।'],
  ['প্রতি ঘণ্টার AI workflow কীভাবে কাজ করে?', 'নির্ধারিত অফিসিয়াল সাইট প্রতি ঘণ্টায় পরীক্ষা করা হয়। AI শুধু উৎস-পৃষ্ঠার লেখা থেকে সারাংশ বানাতে সাহায্য করে; সারাংশের সংখ্যা ও তারিখ মূল লেখার সাথে মিলিয়ে নেওয়া হয়। AI-assisted আইটেমে আলাদা চিহ্ন থাকে।'],
  ['Deadline countdown কীভাবে হিসাব হয়?', 'যেখানে নোটিশে স্পষ্ট শেষ তারিখ আছে সেখানে সরাসরি countdown দেখানো হয়। কিছু ক্ষেত্রে নোটিশের লেখা থেকে তারিখ অনুমান করা হয় — সেটি “~” চিহ্নে আলাদা করা থাকে, মূল বিজ্ঞপ্তিতে যাচাই করুন।'],
  ['Account তৈরি করতে কী লাগে?', 'ChatGPT sign-in দিয়ে প্রবেশ করে নাম ও study goal দিয়ে একটি profile তৈরি করুন। আমরা আপনার email ঠিকানা সংরক্ষণ করি না।'],
  ['আমার তথ্য কি নিরাপদ?', 'শুধু profile-এর নাম, study focus/goal, আপনার পোস্ট-কমেন্ট এবং আপলোড করা ফাইল সংরক্ষিত হয়। ফাইল শুধু আপনিই দেখতে পারেন। Account পাতা থেকে যেকোনো সময় নিজের ডেটা export বা account মুছে ফেলা যায়।'],
  ['ফোনে app-এর মতো install করা যায়?', 'হ্যাঁ। Browser-এর “Install app” বা “Add to Home screen” ব্যবহার করুন। দুর্বল নেটওয়ার্কেও আগে দেখা পাতা দ্রুত খোলে।'],
  ['নোটিশ কি RSS-এ পাওয়া যায়?', 'হ্যাঁ, /feed.xml ঠিকানায় সব নোটিশের RSS feed আছে।'],
];

export function pageHome(d, ctx) {
  const now = ctx.now;
  const notices = d.notices || [];
  const stats = d.stats || {};
  const deadlines = notices.filter(n => n.deadline && daysUntil(n.deadline, now) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const next = deadlines[0];
  const latest = notices[0];
  const nextInfo = next && deadlineInfo(next.deadline, now);
  const floatA = next ? `<span class="float-label">${icon('clock', 14)} Next deadline</span><b class="float-big">${esc(nextInfo.label)}</b><span class="float-text">${esc(truncate(next.title, 62))}</span>` :
    `<span class="float-label">${icon('clock', 14)} Deadline tracker</span><b class="float-big">Countdown</b><span class="float-text">আবেদনের শেষ তারিখ এখানে দেখা যাবে</span>`;
  const floatB = latest ? `<span class="float-label">${icon('bell', 14)} Latest notice</span><span class="float-title">${esc(truncate(latest.title, 70))}</span><span class="float-text">${chip(latest.category)} ${esc(timeAgo(latest.created, now))}</span>` :
    `<span class="float-label">${icon('bell', 14)} Latest notice</span><span class="float-text">নতুন নোটিশ এলে এখানে দেখাবে</span>`;
  const floatC = `<span class="float-label">${icon('users', 14)} Community</span><b class="float-big">${esc(stats.members ?? 0)}</b><span class="float-text">members · ${esc(stats.posts ?? 0)} posts</span>`;
  const ticker = notices.slice(0, 10).map(item =>
    `<a href="/notice/${encodeURIComponent(item.id)}" data-link>${chip(item.category)}<span>${esc(truncate(item.title, 84))}</span></a>`).join('');
  const features = [
    ['shield', 'Verified notices', 'প্রতিটি নোটিশের সাথে মূল সরকারি/প্রতিষ্ঠানের লিংক। এক ক্লিকে উৎস যাচাই করুন।'],
    ['clock', 'Deadline countdown', 'আবেদনের শেষ তারিখ কত দিন বাকি এক নজরে দেখুন এবং calendar-এ যোগ করুন।'],
    ['sparkle', 'Hourly AI workflow', 'প্রতি ঘণ্টায় উৎস-সাইট পরীক্ষা, AI-assisted সারাংশ এবং কঠোর যাচাই।'],
    ['users', 'Student community', 'প্রশ্ন করুন, অভিজ্ঞতা শেয়ার করুন, helpful উত্তর save করুন।'],
    ['lock', 'Private File Desk', 'আপনার PDF/ছবি নিরাপদে রাখুন — শুধু আপনিই দেখতে পাবেন।'],
    ['phone', 'Install & offline', 'ফোনে app-এর মতো install করুন; দুর্বল নেটওয়ার্কেও দ্রুত লোড।'],
  ].map(([ic, title, text], i) => `<div class="card feature card--hover" data-tilt data-reveal><div class="feature-icon feature-icon--${i % 6}">${icon(ic, 22)}</div><h3>${title}</h3><p class="muted">${text}</p></div>`).join('');
  return `<section class="hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <span class="eyebrow eyebrow--glow" data-reveal>${icon('sparkle', 14)} বাংলাদেশের admission ও education update</span>
        <h1 id="heading" class="hero-title" tabindex="-1" data-reveal>Admission, Notice ও Study <span class="gradient-text">এক জায়গায়</span></h1>
        <p class="hero-sub" data-reveal>সরকারি ও বিশ্ববিদ্যালয়ের যাচাইকৃত নোটিশ, deadline countdown, study guideline আর শিক্ষার্থীদের community — মূল উৎসের লিংকসহ।</p>
        <div class="hero-cta" data-reveal>
          <a class="btn btn--primary btn--lg" href="/notices" data-link>Notice Board দেখুন ${icon('arrow', 18)}</a>
          <a class="btn btn--ghost btn--lg" href="/community" data-link>Community-তে যোগ দিন</a>
        </div>
        <div class="hero-proof" data-reveal>${freshnessBadge(d, now)}<span class="muted">মূল উৎসের লিংকসহ · তারিখ ও সংখ্যা যাচাই করা</span></div>
        <button class="hero-search" type="button" data-act="palette" data-reveal>${icon('search', 18)}<span>Search notices, study, posts…</span><kbd>Ctrl K</kbd></button>
      </div>
      <div class="hero-stage">
        <canvas id="globe" class="globe" aria-hidden="true"></canvas>
        <div class="float-cards">
          <div class="float float--a" data-float="1.0">${floatA}</div>
          <div class="float float--b" data-float="1.6">${floatB}</div>
          <div class="float float--c" data-float="0.7">${floatC}</div>
        </div>
      </div>
    </div>
    <a class="scroll-cue" href="#latest" aria-label="Scroll to latest notices">${icon('chevron', 22)}</a>
  </section>
  ${ticker ? `<div class="ticker" aria-label="Latest notices"><div class="ticker-track"><div class="ticker-set">${ticker}</div><div class="ticker-set" aria-hidden="true">${ticker}</div></div></div>` : ''}
  <section class="container stats" aria-label="Site statistics">
    ${[['Members', stats.members], ['Community posts', stats.posts], ['Notices tracked', stats.notices], ['Study resources', stats.study]].map(([label, value]) =>
      `<div class="stat" data-reveal><b data-count="${Number(value) || 0}">${Number(value) || 0}</b><span>${label}</span></div>`).join('')}
  </section>
  <section class="container section" id="deadlines">
    ${sectionHead('Don’t miss out', 'আসন্ন <span class="gradient-text">deadline</span>', 'আবেদনের শেষ তারিখ অনুযায়ী সাজানো।', '<a class="btn btn--ghost btn--sm" href="/notices" data-link>সব নোটিশ</a>')}
    <div class="rail" tabindex="0" aria-label="Upcoming deadlines">${deadlines.length ? deadlines.slice(0, 8).map(item => deadlineCard(item, ctx)).join('') : emptyState('এখনো কোনো deadline ট্র্যাক করা হয়নি। নতুন admission notice এলে এখানে countdown দেখা যাবে।')}</div>
  </section>
  <section class="container section" id="latest">
    ${sectionHead('Notice Board', 'সর্বশেষ <span class="gradient-text">নোটিশ</span>', 'ভর্তি, পরীক্ষা, ছুটি ও সরকারি বিজ্ঞপ্তি — মূল উৎসসহ।', '<a class="btn btn--ghost btn--sm" href="/notices" data-link>View all</a>')}
    <div class="grid grid-3">${notices.length ? notices.slice(0, 6).map(item => noticeCard(item, ctx)).join('') : emptyState('এখনো কোনো নোটিশ প্রকাশিত হয়নি।')}</div>
  </section>
  ${d.digest ? `<section class="container section"><div class="card digest" data-reveal><div class="digest-icon">${icon('sparkle', 24)}</div>
    <div><span class="eyebrow">AI-assisted digest</span><p class="digest-text">${esc(d.digest.text)}</p>
    <p class="muted small">${esc(timeAgo(Date.parse(d.digest.generatedAt), now))} তৈরি · সারাংশ AI-সহায়তায় তৈরি; সিদ্ধান্তের আগে মূল নোটিশ যাচাই করুন।</p></div></div></section>` : ''}
  <section class="container section" id="features">
    ${sectionHead('Why Academic Admission', 'শিক্ষার্থীদের জন্য <span class="gradient-text">সবকিছু</span>', 'দ্রুত, নিরাপদ এবং সব ডিভাইসে সুন্দরভাবে চলে।')}
    <div class="grid grid-3">${features}</div>
  </section>
  ${(d.top || []).length ? `<section class="container section">${sectionHead('Community', 'এই সপ্তাহের <span class="gradient-text">আলোচিত</span> পোস্ট', 'Comments ও reactions অনুযায়ী গত ৭ দিনের সেরা।', '<a class="btn btn--ghost btn--sm" href="/community" data-link>Open community</a>')}
    <div class="grid grid-2 minis" data-reveal>${d.top.slice(0, 4).map(miniPost).join('')}</div></section>` : ''}
  <section class="container section"><div class="cta-band" data-reveal>
    <div><h2>আজই আপনার profile তৈরি করুন</h2><p>পোস্ট করুন, save করুন, নিজের study goal ট্র্যাক করুন এবং Information Desk-এ প্রশ্ন পাঠান।</p></div>
    ${ctx.user?.profile ? '<a class="btn btn--light btn--lg" href="/account" data-link>My account</a>' :
      ctx.user?.signedIn ? '<a class="btn btn--light btn--lg" href="/account" data-link>Create profile</a>' :
      '<a class="btn btn--light btn--lg" href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">Sign in with ChatGPT</a>'}</div></section>`;
}

export function pageNotices(d, ctx) {
  const now = ctx.now;
  const notices = d.notices || [];
  const counts = Object.fromEntries(noticeTypes.map(t => [t, notices.filter(n => n.category === t).length]));
  const deadlines = notices.filter(n => n.deadline && daysUntil(n.deadline, now) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  return `${pageHead('Bangladesh education', 'Notice Board', 'ভর্তি, পরীক্ষা, ছুটি ও শিক্ষা-সংক্রান্ত জরুরি খবর — প্রতিটির সাথে মূল উৎসের লিংক।', `<div class="head-meta">${freshnessBadge(d, now)}</div>`)}
  <div class="container layout">
    <div class="main-col">
      <div class="toolbar" data-reveal>
        <label class="search-field">${icon('search', 18)}<input id="noticeSearch" type="search" placeholder="নোটিশ খুঁজুন…" aria-label="Search notices" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filter by category">
          <button class="chip-btn" type="button" data-filter="" aria-pressed="true">All <b>${notices.length}</b></button>
          ${noticeTypes.map(t => `<button class="chip-btn" type="button" data-filter="${t}" aria-pressed="false">${t} <b>${counts[t]}</b></button>`).join('')}
        </div>
      </div>
      <div class="grid grid-2" id="noticeGrid">${notices.length ? notices.map(item => noticeCard(item, ctx)).join('') : emptyState('এখনো কোনো নোটিশ প্রকাশিত হয়নি।')}</div>
      <p class="empty" id="noticeEmpty" hidden>কোনো নোটিশ পাওয়া যায়নি। অন্য শব্দ বা category চেষ্টা করুন।</p>
    </div>
    <aside class="side-col">
      <div class="card side" data-reveal><h2>${icon('clock', 18)} আসন্ন deadline</h2>
        ${deadlines.length ? deadlines.map(item => { const info = deadlineInfo(item.deadline, now); return `<a class="mini" href="/notice/${encodeURIComponent(item.id)}" data-link><strong>${esc(truncate(item.title, 64))}</strong><span class="deadline deadline--${info.tone}">${esc(info.label)}</span></a>`; }).join('') : '<p class="muted">কোনো আসন্ন deadline নেই।</p>'}</div>
      <div class="card side" data-reveal><h2>${icon('rss', 18)} Stay updated</h2>
        <p class="muted">নতুন নোটিশ আপনার feed reader-এ পেতে RSS ব্যবহার করুন।</p>
        <a class="btn btn--ghost btn--sm" href="/feed.xml">${icon('rss', 14)} RSS feed</a></div>
    </aside>
  </div>`;
}

export function pageNotice(d, ctx) {
  const item = d.item;
  const now = ctx.now;
  const info = deadlineInfo(item.deadline, now);
  const path = `/notice/${encodeURIComponent(item.id)}`;
  return `<article class="container article">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-link>Home</a><span>/</span><a href="/notices" data-link>Notice Board</a><span>/</span><span aria-current="page">${esc(truncate(item.title, 44))}</span></nav>
    <header class="article-head" data-reveal>
      <div class="notice-top">${chip(item.category)}${item.ai ? `<span class="tag">${icon('sparkle', 12)}AI-assisted</span>` : ''}<time class="muted" datetime="${new Date(item.created).toISOString().slice(0, 10)}">${esc(fmtDate(item.created))}</time></div>
      <h1 id="heading" tabindex="-1">${esc(item.title)}</h1>
      <p class="muted">${icon('shield', 15)} ${esc(item.source)} · ${esc(item.origin === 'Admin' ? 'Site admin' : 'Editorial feed')}</p>
    </header>
    <div class="article-grid">
      <div class="card article-body" data-reveal><p class="lead">${esc(item.summary)}</p>
        ${item.url ? `<div class="cta-row"><a class="btn btn--primary btn--lg" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 18)}মূল বিজ্ঞপ্তি দেখুন</a></div>` : ''}
        <p class="muted small note">${icon('info', 14)} এই পাতার সারাংশ সুবিধার জন্য। আবেদন বা সিদ্ধান্তের আগে অবশ্যই মূল বিজ্ঞপ্তি যাচাই করুন।</p>
        <h2 class="share-title">Share</h2>${shareRow(item.title, path)}</div>
      <aside class="stack">
        ${info && info.days >= 0 ? `<div class="card side deadline-side deadline-card--${info.tone}" data-reveal><h2>${icon('clock', 18)} Deadline</h2>
          <div class="big-count"><b>${bn(info.days)}</b><span>${info.days === 0 ? 'আজই শেষ দিন' : 'দিন বাকি'}</span></div>
          <p class="muted">${icon('calendar', 14)} ${esc(fmtDate(Date.parse(item.deadline + 'T00:00:00+06:00')))}${item.deadlineInferred ? '<br><span class="small">নোটিশের লেখা থেকে অনুমান করা — মূল বিজ্ঞপ্তিতে যাচাই করুন।</span>' : ''}</p>
          <a class="btn btn--ghost btn--sm" href="/ics/${encodeURIComponent(item.id)}.ics">${icon('calendar', 14)} Add to calendar</a></div>` :
          info ? `<div class="card side" data-reveal><h2>${icon('clock', 18)} Deadline</h2><p class="muted">${esc(info.label)} · ${esc(fmtDate(Date.parse(item.deadline + 'T00:00:00+06:00')))}</p></div>` : ''}
        ${(d.related || []).length ? `<div class="card side" data-reveal><h2>${icon('bell', 18)} Related</h2>${d.related.map(r => `<a class="mini" href="/notice/${encodeURIComponent(r.id)}" data-link><strong>${esc(truncate(r.title, 70))}</strong><span class="muted small">${esc(r.category)} · ${esc(fmtDate(r.created))}</span></a>`).join('')}</div>` : ''}
      </aside>
    </div>
  </article>`;
}

export function pageStudy(d, ctx) {
  const items = d.items || [];
  const counts = Object.fromEntries(studyTypes.map(t => [t, items.filter(n => n.category === t).length]));
  return `${pageHead('Learning resources', 'Study &amp; Guidelines', 'Study tips, শিক্ষামূলক video, দরকারি website এবং গত ৭ দিনের আলোচিত পোস্ট।', `<div class="head-meta">${freshnessBadge(d, ctx.now)}</div>`)}
  <div class="container layout">
    <div class="main-col">
      <div class="toolbar" data-reveal><div class="chips" role="group" aria-label="Filter by category">
        <button class="chip-btn" type="button" data-filter="" aria-pressed="true">All <b>${items.length}</b></button>
        ${studyTypes.map(t => `<button class="chip-btn" type="button" data-filter="${t}" aria-pressed="false">${t} <b>${counts[t]}</b></button>`).join('')}</div></div>
      <div class="grid grid-2" id="studyGrid">${items.length ? items.map(studyCard).join('') : emptyState('এই category-তে এখনো কিছু প্রকাশিত হয়নি।')}</div>
    </div>
    <aside class="side-col">
      <div class="card timer" data-reveal data-timer><h2>${icon('timer', 18)} Focus timer</h2>
        <div class="timer-face"><b data-timer-display>25:00</b><span class="muted" data-timer-mode>Focus</span></div>
        <div class="timer-bar"><i data-timer-bar></i></div>
        <div class="actions"><button class="btn btn--primary btn--sm" type="button" data-act="timer-toggle">${icon('play', 14)} Start</button>
          <button class="btn btn--ghost btn--sm" type="button" data-act="timer-reset">Reset</button>
          <button class="btn btn--ghost btn--sm" type="button" data-act="timer-mode">Focus / Break</button></div>
        <p class="muted small">Pomodoro: ২৫ মিনিট মনোযোগ, ৫ মিনিট বিরতি।</p></div>
      <div class="card side" data-reveal><h2>${icon('star', 18)} Top posts · 7 days</h2>
        ${(d.top || []).length ? d.top.map(miniPost).join('') : '<p class="muted">গত ৭ দিনে কোনো পোস্ট নেই।</p>'}</div>
    </aside>
  </div>`;
}

export function pageCommunity(d, ctx) {
  const topic = d.topic || '';
  return `${pageHead('Student community', 'Community', 'প্রশ্ন করুন, অভিজ্ঞতা শেয়ার করুন এবং অন্য শিক্ষার্থীদের কাছ থেকে শিখুন।')}
  <div class="container layout">
    <div class="main-col stack">
      <div class="card form"><h2>শুরু করুন · Editorial guides</h2>
        <details><summary>আবেদনের আগে কোন তথ্যগুলো মিলিয়ে দেখব?</summary><p>প্রতিষ্ঠান, ইউনিট, সেশন, আবেদন ও ফি জমার শেষ সময়, যোগ্যতার শর্ত এবং পরীক্ষার তারিখ মিলিয়ে দেখুন। <a href="/admissions" data-link>অফিসিয়াল উৎসসহ ক্যালেন্ডার</a> দেখুন।</p></details>
        <details><summary>Fee paid দেখলে এরপর কী করব?</summary><p>অফিসিয়াল পোর্টালে payment status দেখুন, রসিদ নিজের কাছে রাখুন ও প্রবেশপত্র প্রকাশের তারিখ লিখে রাখুন। রসিদ বা application ID কমিউনিটিতে প্রকাশ করবেন না।</p></details>
        <details><summary>পরীক্ষার প্রস্তুতি কোথায় শুরু করব?</summary><p>প্রথমে মূল বিজ্ঞপ্তির syllabus, নম্বর বিভাজন ও negative marking দেখুন। তারপর <a href="/study" data-link>Study &amp; Guidelines</a> থেকে বিষয়ভিত্তিক প্রস্তুতি সাজান।</p></details>
      </div>
      <div id="composer">${composer(ctx)}</div>
      <div class="toolbar"><div class="chips" role="group" aria-label="Filter by topic">
        <button class="chip-btn" type="button" data-topic="" aria-pressed="${!topic}">All topics</button>
        ${topics.map(t => `<button class="chip-btn" type="button" data-topic="${t}" aria-pressed="${topic === t}">${t}</button>`).join('')}</div></div>
      <div id="posts" class="stack">${(d.posts || []).length ? d.posts.map(post => postCard(post, ctx)).join('') : emptyState('এই topic-এ এখনো কোনো পোস্ট নেই। প্রথম পোস্টটি আপনিই করুন!')}</div>
      <div class="center"><button class="btn btn--ghost" type="button" data-act="more" ${d.more ? '' : 'hidden'}>Load older posts</button></div>
    </div>
    <aside class="side-col">
      <div class="card side" data-reveal><h2>${icon('shield', 18)} Community guidelines</h2>
        <ul class="ticks"><li>ভদ্র ভাষায় লিখুন, ব্যক্তিগত তথ্য শেয়ার করবেন না।</li><li>তথ্য দিলে উৎস উল্লেখ করুন।</li><li>স্প্যাম বা বিভ্রান্তিকর পোস্ট report করুন।</li></ul></div>
      <div class="card side" data-reveal><h2>${icon('star', 18)} Top posts · 7 days</h2>
        ${(d.top || []).length ? d.top.map(miniPost).join('') : '<p class="muted">গত ৭ দিনে কোনো পোস্ট নেই।</p>'}</div>
    </aside>
  </div>`;
}

export function pagePost(d, ctx) {
  const post = d.post;
  return `<div class="container article">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-link>Home</a><span>/</span><a href="/community" data-link>Community</a><span>/</span><span aria-current="page">${esc(truncate(post.title, 44))}</span></nav>
    <h1 id="heading" class="sr-only" tabindex="-1">${esc(post.title)}</h1>
    ${postCard(post, ctx, { full: true })}
    <div class="card side" data-reveal><h2>Share</h2>${shareRow(post.title, '/post/' + post.id)}</div>
  </div>`;
}

export function pageAbout(d, ctx) {
  const contact = ctx.settings?.contactEmail;
  return `${pageHead('About', 'About &amp; FAQ', 'Academic Admission কীভাবে কাজ করে, তথ্য কোথা থেকে আসে এবং আপনার ডেটা কীভাবে সুরক্ষিত থাকে।')}
  <div class="container layout">
    <div class="main-col stack">
      <div class="card prose" data-reveal><h2>আমাদের লক্ষ্য</h2>
        <p>প্রতিবছর হাজার হাজার শিক্ষার্থী বিভিন্ন সাইটে ঘুরে admission notice খোঁজে। আমরা সরকারি ও প্রতিষ্ঠানের নোটিশ মূল উৎসের লিংকসহ এক জায়গায় সাজিয়ে দিই — যাতে কোনো deadline মিস না হয়।</p></div>
      <div class="faq" data-reveal>${faqItems.map(([q, a], i) => `<details class="card faq-item"${i === 0 ? ' open' : ''}><summary>${esc(q)}<span class="chev">${icon('chevron', 18)}</span></summary><p>${esc(a)}</p></details>`).join('')}</div>
    </div>
    <aside class="side-col">
      <div class="card side" data-reveal><h2>${icon('mail', 18)} Contact</h2>
        ${contact ? `<p><a href="mailto:${esc(contact)}">${esc(contact)}</a></p>` : '<p class="muted">Account পাতার Information Desk থেকে প্রশ্ন পাঠান।</p>'}
        <a class="btn btn--ghost btn--sm" href="/account" data-link>Information Desk</a></div>
    </aside>
  </div>`;
}

export function pagePrivacy() {
  return `${pageHead('Legal', 'Privacy Policy', 'আমরা কোন তথ্য সংরক্ষণ করি, কেন করি এবং আপনি কীভাবে নিয়ন্ত্রণ করবেন।')}
  <div class="container narrow"><div class="card prose" data-reveal>
    <h2>কোন তথ্য সংরক্ষিত হয়</h2>
    <ul><li><strong>Profile:</strong> আপনার দেওয়া display name, study focus ও goal। </li>
    <li><strong>Application tracker:</strong> shortlist ও application stage। GPA ও subject grades calculator চালাতে browser-এর বাইরে পাঠানো হয় না।</li>
    <li><strong>Sign-in ও reminders:</strong> Google sign-in চালু থাকলে Google account identifier ও মেয়াদযুক্ত session record রাখা হয়। Email reminder চালু করলে sign-in email ও consent-এর সময় রাখা হয়। My Applications থেকে email বন্ধ করতে পারবেন।</li>
    <li><strong>Community content:</strong> আপনার পোস্ট, comment, reaction ও bookmark।</li>
    <li><strong>Information Desk:</strong> আপনার request ও admin-এর উত্তর (শুধু আপনি ও admin দেখেন)।</li>
    <li><strong>File Desk:</strong> আপনার আপলোড করা PDF/PNG/JPEG — private storage-এ, শুধু আপনার account থেকে দেখা যায়।</li></ul>
    <h2>Analytics</h2>
    <p>আমরা cookie-বিহীন, গোপনীয়তা-বান্ধব analytics ব্যবহার করি: পাতার নাম, referrer-এর ডোমেইন, ডিভাইসের ধরন ও দেশ। কোনো IP ঠিকানা সংরক্ষণ করা হয় না; অনন্য দর্শক গণনার জন্য প্রতিদিন বদলে যাওয়া একটি বেনামি hash দুই দিনের জন্য রাখা হয়। “Do Not Track” বা Global Privacy Control চালু থাকলে কিছুই পাঠানো হয় না।</p>
    <h2>আপনার নিয়ন্ত্রণ</h2>
    <p>Account পাতা থেকে যেকোনো সময় নিজের ডেটা JSON হিসেবে export করতে বা account ও সংশ্লিষ্ট সব কনটেন্ট স্থায়ীভাবে মুছে ফেলতে পারবেন।</p>
    <h2>তৃতীয় পক্ষ</h2>
    <p>Sign-in-এর জন্য ChatGPT বা Google ব্যবহৃত হতে পারে। Email reminder সক্রিয় থাকলে delivery provider Resend প্রাপকের email এবং reminder বার্তা পায়। নোটিশের লিংকগুলো বাইরের সরকারি/প্রতিষ্ঠানের সাইটে যায় — সেগুলোর নিজস্ব নীতি প্রযোজ্য।</p>
    <p class="muted small">এটি একটি সাধারণ নীতিপত্র; আইনগত প্রয়োজনে পেশাদার পরামর্শ নিন।</p>
  </div></div>`;
}

export function pageTerms() {
  return `${pageHead('Legal', 'Terms of Use', 'এই platform ব্যবহারের সহজ শর্তাবলি।')}
  <div class="container narrow"><div class="card prose" data-reveal>
    <h2>তথ্যের নির্ভরযোগ্যতা</h2>
    <p>নোটিশের সারাংশ সুবিধার জন্য। এটি মূল বিজ্ঞপ্তির বিকল্প নয়; আবেদন বা সিদ্ধান্তের আগে মূল উৎস যাচাই করা আপনার দায়িত্ব। AI-সহায়তায় তৈরি সারাংশে ভুল থাকতে পারে।</p>
    <h2>Community আচরণ</h2>
    <p>অন্যের প্রতি সম্মান রাখুন। স্প্যাম, প্রতারণা, হয়রানি, ব্যক্তিগত তথ্য ফাঁস বা অবৈধ কনটেন্ট নিষিদ্ধ। নিয়ম ভাঙলে কনটেন্ট মুছে ফেলা বা account স্থগিত করা হতে পারে।</p>
    <h2>আপনার কনটেন্ট</h2>
    <p>আপনি যা পোস্ট করেন তার দায় আপনার। প্রকাশ করে আপনি এই platform-এ তা দেখানোর অনুমতি দেন। যেকোনো সময় নিজের কনটেন্ট মুছতে পারবেন।</p>
    <h2>পরিবর্তন</h2>
    <p>শর্তাবলি সময়ে সময়ে হালনাগাদ হতে পারে।</p>
  </div></div>`;
}

export function pageNotFound() {
  return `<section class="container notfound"><div class="notfound-art" aria-hidden="true">404</div>
    <h1 id="heading" tabindex="-1">পাতাটি খুঁজে পাওয়া যায়নি</h1><p class="lead">লিংকটি ভুল হতে পারে বা পাতাটি সরিয়ে নেওয়া হয়েছে।</p>
    <div class="hero-cta"><a class="btn btn--primary" href="/" data-link>Home-এ ফিরুন</a><a class="btn btn--ghost" href="/notices" data-link>Notice Board</a></div></section>`;
}
