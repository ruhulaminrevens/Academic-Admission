# Academic Admission 2.0

Bangladesh admission notices, deadline countdowns, study guidelines and a student community — now with a
futuristic 3D UI, a full Super Admin console, an hourly AI editorial workflow, SEO, analytics and a PWA.
Zero runtime dependencies; one Worker with D1 (database) and R2 (private files).

## What's inside
- **UI/UX** — dark/light gradient themes, WebGL aurora background, interactive 3D globe (Dhaka node), 3D tilt cards, smooth scroll reveal, count-up stats, deadline rings, command palette (`Ctrl/⌘+K` or `/`), mobile bottom tab bar, view transitions, installable PWA with offline fallback. Layouts verified from 320 px phones to 4K; `prefers-reduced-motion`, high-contrast and print styles respected.
- **Super Admin** — Control center at `/admin`: overview, analytics, moderation (reports), content publishing, members (roles/suspension), Info Desk, AI workflow status, site settings (announcement banner, read-only mode, pause sign-ups, socials), audit log, full JSON export. Roles: member < moderator < admin < super admin (`ADMIN_EMAIL`).
- **Database** — additive migration `drizzle/0001_super_admin.sql` (roles, status, pinned, views, deadlines, reports, audit_log, settings, analytics, ai_runs).
- **Hourly AI workflow** — `.github/workflows/hourly-editorial.yml` + `scripts/editorial-ai.mjs`: checks official sources, LLM summarizes new notices, **every number/date is verified against the source text**, schema-validated, committed to `data/editorial.json`; runs are logged in Admin via a signed webhook.
- **Deadlines** — explicit `deadline` field or conservative inference from Bangla/English notice text (marked `~`), countdown rings, one-click calendar (`.ics`).
- **SEO & marketing** — server-rendered pages, canonical/OG/Twitter, JSON-LD (Organization, WebSite+SearchAction, ItemList, NewsArticle, DiscussionForumPosting, FAQPage, Breadcrumb), sitemap, robots, RSS, share buttons, UTM campaign analytics, OG image.
- **Security** — strict CSP (no inline script/style), CSRF origin checks, HMAC webhook, XSS-safe renderers, validated private uploads, rate limits, audit log. See [SECURITY.md](SECURITY.md).
- **Analytics** — first-party, cookie-less, no IPs stored, honors Do Not Track.

## Quick start
```bash
npm test        # build + 29 unit/integration tests (Node 22+)
npm run dev     # http://localhost:8787 with demo data; sign in via /dev/as?u=owner
```
Deploy & operate: [docs/DEPLOY.md](docs/DEPLOY.md) · Admin guide: [docs/ADMIN.md](docs/ADMIN.md) · Env vars: [.env.example](.env.example)

## Layout
```
shared/    pure renderers + helpers (used by Worker SSR, browser and tests)
worker/    Worker source (api, SEO, files, analytics) + HTML shell
client/    browser modules (router, fx, pages, account, admin)
styles/    CSS design system      public/  icons, manifest, service worker
scripts/   build, dev server, D1/R2 shims, AI pipeline, health check
data/      editorial.json (hourly feed) · sources.json (AI sources)
drizzle/   SQL migrations         test/    node:test suites
```
> Upgrade note: apply the migration **before** deploying (a 503 "upgrade pending" is returned otherwise). Keep only one writer of `data/editorial.json`.
