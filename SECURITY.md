# Security overview

- **Identity** comes only from platform headers (`oai-authenticated-user-*`); the Worker never trusts client-supplied identity.
- **Super Admin** = the exact `ADMIN_EMAIL`. Roles: member < moderator < admin < super admin. Role changes, settings, audit log and full export are Super-Admin-only; moderators can only handle reports; every privileged action is written to the audit log.
- **CSRF**: all writes require a same-origin `Origin` and `Sec-Fetch-Site`; webhook uses HMAC-SHA256 over `timestamp.body` with a ±5 minute window and constant-time comparison.
- **CSP**: `default-src 'self'`, no inline script/style, no `unsafe-*`; the theme bootstrap is a tiny external script. Also HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, CORP, and `frame-ancestors` (override with `FRAME_ANCESTORS`).
- **XSS**: all dynamic text is escaped in shared renderers; JSON-LD is escaped against `</script>`; links are HTTPS-only.
- **Uploads**: PDF/PNG/JPEG only, magic-byte validated, 5 MB cap, 12 per user, stored privately, served as attachment with `sandbox` CSP.
- **Privacy**: cookie-less analytics, no IPs stored (daily salted hash kept 2 days), honors Do Not Track / Global Privacy Control; users can export or delete all their data.
- **Abuse controls**: per-user rate limits, bot filtering on analytics, suspension with reason, read-only mode, registration pause.

Report vulnerabilities to the address in `/.well-known/security.txt` (set `SECURITY_CONTACT`).
