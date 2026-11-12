CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  topic TEXT NOT NULL CHECK(topic IN ('Admission','Study','Question','General')),
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX posts_recent ON posts(created DESC);
--> statement-breakpoint
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES profiles(id),
  body TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX comments_post ON comments(post,created);
--> statement-breakpoint
CREATE TABLE reactions (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES profiles(id),
  kind TEXT NOT NULL CHECK(kind IN ('like','helpful')),
  PRIMARY KEY(post,author)
);
--> statement-breakpoint
CREATE TABLE bookmarks (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES profiles(id),
  PRIMARY KEY(post,author)
);
--> statement-breakpoint
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL CHECK(section IN ('notice','study')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX resources_section ON resources(section,created DESC);
--> statement-breakpoint
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES profiles(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  answer TEXT,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX tickets_owner ON tickets(owner,created DESC);
