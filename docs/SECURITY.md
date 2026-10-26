# Security model

- JWT access cookies last 15 minutes; random refresh secrets last 30 days. Both cookies are HTTP-only, SameSite=Lax, and Secure in production. Refresh cookies are scoped to `/api/auth`; access cookies to `/api`. No authentication material is stored in localStorage. Only theme preference is persisted there.
- Access tokens identify a database session; every protected request checks that the session exists, is not revoked, and has not expired. Logout/password reset/password change/account deletion invalidate sessions immediately.
- Refresh secrets and email/reset tokens are stored as SHA-256 hashes. Passwords use bcrypt cost 12. Refresh-family rotation is serialized with a database lock; reuse revokes the family.
- All mutating requests must carry an Origin matching `WEB_URL`, including login/logout/refresh. CORS permits that origin with credentials. CLI/API clients must supply the same Origin; Origin is CSRF protection, not user authentication.
- Authentication is limited to 10 requests/minute/IP; other endpoints have a 150-request/minute/IP default. Configure edge-level distributed rate limits for multiple instances. Do not blindly trust client-supplied proxy IP headers.
- DTOs reject unknown fields and validate types, lengths, identifiers, dates, currencies, and numeric ranges. Rendering uses React text escaping; there is no raw user HTML rendering.
- All products, receipts, profile, and notification queries include user ownership. Receipt content requires ownership plus a short-lived signed token in local development; S3 links are signed bearer capabilities expiring after 60 seconds.
- File uploads have memory/size/count bounds and magic-byte allowlisting. Never infer file type from a filename. S3 buckets are private, and random keys contain no original filenames. Receipt identifiers and storage keys are not authorization by themselves.
- Product and storage quotas are checked under a per-user database row lock. No client-side plan selection endpoint exists.
- Dates are interpreted consistently in UTC. Reminder uniqueness covers product, expiration date, and threshold; notification uniqueness covers delivery ID.
- Service workers precache static application assets only. API responses have `Cache-Control: no-store`; there are no runtime caching rules for authenticated data or receipts.

See deployment documentation for SMTP delivery semantics, storage crash reconciliation, malware scanning boundaries, backups, and multi-instance rate limiting. Report suspected vulnerabilities privately to the deployment owner; never include receipt contents or raw session tokens in reports.
