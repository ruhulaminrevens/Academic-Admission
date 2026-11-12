# Academic Admission

Bangladesh academic notices, a student community, study resources, and private member dashboards.

## Public editorial updates

`data/editorial.json` is the live editorial feed consumed from the default branch of this repository. The Site fetches it on demand, caches it briefly and falls back to the last usable feed if GitHub is unavailable. Feed changes do not require a Site rebuild. Admin notices and resources are stored separately.

- Keep `schemaVersion` at 1 and update `checkedAt` in UTC after a successful source check.
- Each item needs a stable lowercase hyphenated `id`, `category`, `title`, `summary`, `publishedAt` (YYYY-MM-DD), `source` and `url`. Keep titles within 160 characters, summaries within 800 and source labels within 100.
- Notice categories: `Admission`, `Exam`, `Holiday`, `Official`, `Breaking`. Every notice needs an HTTPS source.
- Study categories: `Trend`, `Tip`, `Video`, `Website`. Use an HTTPS URL for linked material. Keep up to 80 notices and 60 study items.
- Prefer the issuing institution or government notice. For breaking news, check independent reliable reporting and link the clearest primary source available. Summarize in Bangla or Bangla-English, and preserve exact dates only when verified.
- Keep recent, relevant entries and correct existing IDs in place. Never place personal data or private dashboard records in the public feed.

## Build and hosting

Use Node.js 22+ and run `node scripts/build.mjs`. The build bundles the Worker entry point and static assets in `dist/server/index.js`. ChatGPT Sites hosts the Worker with D1 (`DB`) and R2 (`BUCKET`). The hosting manifest in a Sites checkout also contains its own project ID. Apply the D1 migration in `drizzle/` before serving API requests.

Sites provides ChatGPT sign-in and verified request identity. Configure `ADMIN_EMAIL` as a hosting secret for the owner. Profiles, member records and uploaded files belong to individual signed-in accounts. The earlier admission tracker is an optional private input held in the owner’s Sites checkout.
