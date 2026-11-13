# Deploy & operate

## 1. Build & test
```bash
npm test            # builds, then runs unit + integration tests (Node 22+)
npm run dev         # local server with demo data → http://localhost:8787
                    #   sign in as /dev/as?u=owner | admin | mod | rahim | nila   (sign out: /dev/as?u=)
npm run build       # → dist/server/index.js + dist/.openai/hosting.json
```

## 2. Database migration (do this BEFORE deploying the new Worker)
`drizzle/0001_super_admin.sql` adds columns (roles, status, pinned, views, deadlines…) and new tables
(reports, audit_log, settings, analytics_*, ai_runs). Apply it to the D1 database first, then deploy.
If the Worker is deployed first, requests answer `503 Database upgrade pending` instead of crashing,
and recover as soon as the migration is applied. `GET /api/health` shows `schema: true` when ready.

## 3. Environment
See `.env.example`. Minimum: `ADMIN_EMAIL` (becomes the Super Admin automatically on first sign-in),
`SITE_URL` (correct sitemap/OG/RSS URLs). Optional: `AI_WEBHOOK_SECRET`, `ANALYTICS_SALT`, `SECURITY_CONTACT`, `FRAME_ANCESTORS`.

## 4. Hourly AI workflow
`.github/workflows/hourly-editorial.yml` runs at minute 7 of every hour: fetches the pages in `data/sources.json`,
asks the LLM to summarize only **new** notices, rejects any item whose numbers/dates are not present in the source
text, validates the schema and commits `data/editorial.json`. The Worker reads that file live (60 s cache) and falls
back to the bundled snapshot if GitHub is unreachable. Add repo secret `OPENAI_API_KEY` *or* `ANTHROPIC_API_KEY`
(without a key the run uses the offline `mock` provider). To log runs in Admin → AI workflow, set `SITE_URL` (variable)
and `AI_WEBHOOK_SECRET` (secret, same value as the Worker). Run once by hand: `node scripts/editorial-ai.mjs --dry`.
> Run only ONE writer of `data/editorial.json` (this workflow or your previous automation), otherwise commits conflict.

## 5. Marketing & SEO checklist
- Submit `https://<site>/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
- Tag shared links with `?utm_source=facebook&utm_medium=social&utm_campaign=hsc-2026` — Admin → Analytics reports them.
- `/feed.xml` (RSS) and per-notice calendar files (`/ics/<id>.ics`) are built in; share both.
- Social previews use `/og-image.png` (1200×630). Replace `public/og-image.png` to rebrand.

## 6. Rollback
Redeploy the previous Worker build. The migration is additive; the old Worker ignores new columns/tables.

## Admission Tracker
- Publish the additive `0002_admission_tracker` migration with the Worker. Check `/api/health`, `/admissions`, `/applications`, and the Admission review tab.
- The public calendar starts with three source-backed records. The guest calculator keeps the user's grades in the browser. Incomplete eligibility rules intentionally return a request for more information.
- The hourly workflow monitors the current official URLs in `data/admissions.json`. A changed PDF is flagged even if it contains only scanned images. Inspect the official document before approving. GitHub observations are private to the admin review screen on the Site, and their public repository payload contains public-source text only.
- Google: create a Web application OAuth client. Add the exact `<SITE_URL>/auth/google/callback` redirect, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_STATE_SECRET` in Sites. Sign in to both providers to link an existing profile. Google sessions do not grant elevated Admin access.
- Email: verify a sender domain in Resend. Set `RESEND_API_KEY`, `REMINDER_FROM` and `ADMISSION_JOB_SECRET` in Sites. Set GitHub Actions repository variable `SITE_URL` and the matching `ADMISSION_JOB_SECRET` as a secret. Run Hourly editorial run manually and check an opted-in test account with an upcoming deadline before announcing email delivery.
- Keep `private/admission-tracker.html` confined to the Sites source. It is optional for GitHub builds and must never be committed to the public repository.
