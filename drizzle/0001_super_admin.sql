ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','admin','superadmin'));
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'));
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN last_seen INTEGER;
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE resources ADD COLUMN deadline TEXT;
--> statement-breakpoint
ALTER TABLE resources ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE resources ADD COLUMN updated INTEGER;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed'));
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN answered INTEGER;
--> statement-breakpoint
UPDATE tickets SET status = 'answered', answered = created WHERE answer IS NOT NULL;
--> statement-breakpoint
CREATE INDEX profiles_role ON profiles(role);
--> statement-breakpoint
CREATE INDEX profiles_created ON profiles(created DESC);
--> statement-breakpoint
CREATE INDEX posts_pinned ON posts(pinned, created DESC);
--> statement-breakpoint
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('post','comment')),
  target TEXT NOT NULL,
  post TEXT NOT NULL,
  reporter TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(reason IN ('spam','abuse','misleading','other')),
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  handled_by TEXT,
  handled INTEGER,
  created INTEGER NOT NULL,
  UNIQUE(reporter, kind, target)
);
--> statement-breakpoint
CREATE INDEX reports_status ON reports(status, created DESC);
--> statement-breakpoint
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX audit_recent ON audit_log(created DESC);
--> statement-breakpoint
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL,
  updated_by TEXT
);
--> statement-breakpoint
CREATE TABLE analytics_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, path)
);
--> statement-breakpoint
CREATE TABLE analytics_dims (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, kind, key)
);
--> statement-breakpoint
CREATE TABLE analytics_seen (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY(day, visitor)
);
--> statement-breakpoint
CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  started INTEGER NOT NULL,
  finished INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','partial','failed','noop')),
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  sources INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  commit_sha TEXT NOT NULL DEFAULT '',
  received INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_runs_recent ON ai_runs(started DESC);
