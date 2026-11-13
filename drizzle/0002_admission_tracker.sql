CREATE TABLE admission_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  circular TEXT NOT NULL,
  payload TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX admission_revisions_circular ON admission_revisions(circular, id DESC);
--> statement-breakpoint
CREATE TABLE admission_snapshots (
  circular TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  checked INTEGER NOT NULL,
  reviewed_hash TEXT
);
--> statement-breakpoint
CREATE TABLE admission_plans (
  owner TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  circular TEXT NOT NULL,
  stage TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY(owner, circular)
);
--> statement-breakpoint
CREATE TABLE admission_reminders (
  owner TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  opted_in INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE admission_mail (
  owner TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  started INTEGER NOT NULL,
  sent INTEGER,
  PRIMARY KEY(owner, event)
);
--> statement-breakpoint
CREATE TABLE google_identities (
  subject TEXT PRIMARY KEY,
  owner TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE google_sessions (
  token TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  email TEXT NOT NULL,
  expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX google_sessions_owner ON google_sessions(owner);
--> statement-breakpoint
CREATE INDEX google_sessions_expiry ON google_sessions(expires);
