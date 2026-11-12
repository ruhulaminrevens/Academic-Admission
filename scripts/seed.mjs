// Demo data for local development, screenshots and tests.
const day = 86400000;
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function seedDemo(d1) {
  const now = Date.now();
  const insert = (sql, ...values) => d1.prepare(sql).bind(...values).run();
  const people = [['u-owner', 'Ruhul Amin', 'Super Admin', 'Run Academic Admission', 'superadmin'], ['u-admin', 'Tasnim Akter', 'Admissions desk', '', 'admin'], ['u-mod', 'Imran Hossain', 'Community', '', 'moderator'],
    ['u-rahim', 'Rahim Uddin', 'Engineering (BUET)', 'BUET-এ ভর্তি হওয়া — প্রতিদিন ৬ ঘণ্টা পড়া', 'member'], ['u-nila', 'Nila Sultana', 'Medical', 'Dhaka Medical College', 'member'], ['u-karim', 'Karim Mia', 'HSC', '', 'member']];
  for (const [i, [id, name, focus, goal, role]] of people.entries()) await insert('INSERT INTO profiles(id, name, focus, goal, created, role, last_seen) VALUES(?,?,?,?,?,?,?)', id, name, focus, goal, now - (30 - i * 4) * day, role, now - i * 3600000);
  const posts = [[uid(1), 'u-rahim', 'BUET admission-এর জন্য কোন বই পড়ব?', 'HSC শেষ করেছি, এখন BUET প্রস্তুতি শুরু করতে চাই। Physics ও Math-এর জন্য কোন বইগুলো সবচেয়ে কাজের?', 'Question'],
    [uid(2), 'u-nila', 'Medical admission-এর ৩ মাসের routine', 'গত বছর আমি যে routine মেনে চলেছিলাম সেটি শেয়ার করছি — সকালে Biology, দুপুরে Chemistry, রাতে mock test।', 'Study'],
    [uid(3), 'u-mod', 'Community guidelines — নতুনদের জন্য', 'ভদ্র ভাষায় লিখুন, উৎস উল্লেখ করুন, ব্যক্তিগত তথ্য শেয়ার করবেন না।', 'General'],
    [uid(4), 'u-karim', 'University admission fee কত?', 'সরকারি বিশ্ববিদ্যালয়ে আবেদন ফি সাধারণত কত হয়? কেউ জানলে জানাবেন।', 'Admission']];
  for (const [i, [id, author, title, body, topic]] of posts.entries()) await insert('INSERT INTO posts(id, author, title, body, topic, created, views) VALUES(?,?,?,?,?,?,?)', id, author, title, body, topic, now - (i + 1) * 5 * 3600000, 20 + i * 7);
  await insert('UPDATE posts SET pinned = 1 WHERE id = ?', uid(3));
  await insert('INSERT INTO comments(id, post, author, body, created) VALUES(?,?,?,?,?)', uid(11), uid(1), 'u-nila', 'HC Verma আর Higher Math (Hall & Knight) দিয়ে শুরু করো।', now - 3 * 3600000);
  await insert("INSERT OR IGNORE INTO reactions(post, author, kind) VALUES(?,'u-nila','helpful'),(?,'u-rahim','like'),(?,'u-karim','like')", uid(1), uid(2), uid(2));
  await insert('INSERT INTO tickets(id, owner, subject, body, created) VALUES(?,?,?,?,?)', uid(21), 'u-rahim', 'Admission calendar', 'বছরের admission calendar কোথায় পাব?', now - 2 * 3600000);
  await insert("INSERT INTO reports(id, kind, target, post, reporter, reason, detail, created) VALUES(?,'post',?,?,'u-nila','spam','মনে হচ্ছে বিজ্ঞাপন',?)", uid(31), uid(4), uid(4), now - 3600000);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * day + 6 * 3600000).toISOString().slice(0, 10);
    await insert('INSERT OR REPLACE INTO analytics_daily(day, path, views) VALUES(?,?,?)', d, '/', 40 + ((i * 17) % 35));
    await insert('INSERT OR REPLACE INTO analytics_daily(day, path, views) VALUES(?,?,?)', d, '/notices', 25 + ((i * 11) % 22));
    for (let v = 0; v < 12 + (i % 7); v++) await insert('INSERT OR IGNORE INTO analytics_seen(day, visitor) VALUES(?,?)', d, `v${i}-${v}`);
  }
  const today = new Date(now + 6 * 3600000).toISOString().slice(0, 10);
  for (const [kind, key, views] of [['ref', 'google.com', 210], ['ref', 'facebook.com', 140], ['ref', 'direct', 320], ['device', 'mobile', 520], ['device', 'desktop', 190], ['device', 'tablet', 40], ['country', 'bd', 700], ['country', 'us', 30], ['utm_campaign', 'hsc-2026', 90], ['utm_source', 'facebook', 90]])
    await insert('INSERT OR REPLACE INTO analytics_dims(day, kind, key, views) VALUES(?,?,?,?)', today, kind, key, views);
  await insert("INSERT INTO ai_runs(id, started, finished, status, added, updated, removed, sources, model, notes, received) VALUES(?,?,?,'success',2,1,0,14,'mock','14 sources checked',?)", uid(41), now - 3600000, now - 3500000, now - 3500000);
  await insert("INSERT INTO audit_log(id, actor, actor_name, action, target_type, target, detail, created) VALUES(?,'u-owner','Ruhul Amin','settings.update','settings','','announcement_active',?)", uid(51), now - day);
}
